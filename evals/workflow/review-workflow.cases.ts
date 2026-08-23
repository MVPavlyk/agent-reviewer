import type { WorkflowCase } from "../src/index.js";

/**
 * Systemic ("workflow") tier — asserts the real on-disk harness (CLAUDE.md + skills + subagents,
 * loaded via settingSources:["project"]) behaves as documented. Organized by scenario, not by a
 * single artifact, because these behaviors are cross-cutting.
 *
 * Budget: 7 Claude sessions total.
 *   - 3 × trace     → 1 session each                      = 3
 *   - 1 × activation pair (positive + near-miss negative) = 2
 *   - 1 × contrast  → treatment + control                 = 2
 *
 * `trace` folds several assertions into ONE session (cheaper, coarser) and stops early once its
 * evidence is in — so a dispatch-bearing trace never waits out the nested subagent's full run.
 */
export const cases: WorkflowCase[] = [
  // --- trace (1 session): CLAUDE.md "Read When" routing + subagent dispatch, together -----------
  {
    kind: "trace",
    // Endpoint must NOT already exist, or the model reviews the existing code inline instead of
    // planning-then-dispatching. GET /reviews/:id/export is genuinely absent from routes.ts.
    // FIXED 2026-08-23: first version burned its whole maxTurns budget reading the reviews module's
    // source (routes.ts twice, service.ts, helpers.ts, shared contracts) before ever dispatching —
    // the prompt didn't forbid self-exploration, so a capable model "helpfully" over-prepared.
    // Tightened to explicitly forbid reading implementation code and to name the dispatch as the
    // very next step after api-contracts.md, plus a small maxTurns margin.
    name: "API-route task reads api-contracts AND pulls the architecture-reviewer",
    prompt:
      "Я планую додати НОВИЙ, ще не реалізований ендпоінт GET /reviews/:id/export (віддає ревʼю як " +
      "markdown). Спершу прочитай ЛИШЕ документ з конвенціями API цього репо (не читай і не досліджуй " +
      "код реалізації — це не твоя задача). Одразу після цього, як наступний крок, ОБОВʼЯЗКОВО запусти " +
      "сабагента architecture-reviewer, щоб він оцінив мій план на відповідність onion-шарам — не рецензуй сам.",
    expectFilesRead: ["server/docs/api-contracts.md"],
    expectSubagents: ["architecture-reviewer"],
    maxTurns: 10,
  },

  // --- trace (1 session): two "Read When" rows at once -----------------------------------------
  {
    kind: "trace",
    // Tests the CLAUDE.md "Read When" routing, so the prompt must push toward CONSULTING the docs,
    // not exploring source. Earlier phrasing ("розберись, як усе влаштовано") sent the model straight
    // into schema.ts / pipeline.run.ts and it never opened the routed doc.
    // FIXED 2026-08-23: expected `reviewer-core/docs/pipeline.md`, which never existed in this repo
    // — `reviewer-core/CLAUDE.md`'s own "Read when" table routes pipeline questions to root
    // `README.md` ("pipeline diagram + public API"), not a docs/ file. `docs/README.md` is a
    // separate ADR index, unrelated. The model was reading correctly; the expectation was stale.
    name: "pipeline task follows CLAUDE.md routing to pipeline.md",
    prompt:
      "Я збираюся змінити review pipeline. Перш ніж торкатися коду — звірся з настановами цього репо " +
      "(CLAUDE.md) щодо того, яку документацію треба прочитати для змін у pipeline, і прочитай саме ці документи.",
    expectFilesRead: ["reviewer-core/README.md"],
    maxTurns: 8,
  },

  // --- trace (1 session): CLAUDE.md "Hit unexpected behavior" routing -> gotchas ----------------
  // Was a contrast case, but the control run (empty tmpdir) could still reach the real repo by
  // absolute path and read gotchas.md, making the negative flaky. As a single-session trace it
  // reliably checks the same routing rule: in the real repo, the discovery prompt reads gotchas.md.
  // FIXED 2026-08-23: expected `reviewer-core/insights/gotchas.md` — there is no `insights/`
  // subdirectory in this repo, only a flat `INSIGHTS.md`, and that's exactly what
  // `reviewer-core/CLAUDE.md`'s "Read when" table routes to for "behaviour is non-obvious / mid-debug".
  {
    kind: "trace",
    name: "CLAUDE.md routes a gotchas lookup to reviewer-core/INSIGHTS.md",
    prompt:
      "У reviewer-core я стикнувся з несподіваною поведінкою — щось працює не так, як я очікував. " +
      "За настановами цього репо, де це вже могло бути задокументовано? Прочитай той файл.",
    expectFilesRead: ["reviewer-core/INSIGHTS.md"],
    maxTurns: 5,
  },

  // --- activation pair (2 sessions): positive + near-miss negative ------------------------------
  {
    kind: "activation",
    name: "engineering-insights activates on a genuine discovery",
    prompt:
      "Щойно з'ясував, чому pgvector-запит повертав нуль рядків — розмірність колонки не збіглася " +
      "після зміни моделі ембедингів. Хочу це зафіксувати, щоб більше не наступати.",
    skill: "engineering-insights",
    shouldActivate: true,
    maxTurns: 4,
  },
  {
    kind: "activation",
    name: "near-miss negative — explaining the same topic must NOT record an insight",
    prompt:
      "Поясни, як у pgvector працюють розмірності колонок і чому невідповідність повертає нуль рядків.",
    skill: "engineering-insights",
    shouldActivate: false,
    maxTurns: 4,
  },

  // --- contrast (2 sessions): does CLAUDE.md itself change behavior, not just its presence -------
  // Treatment = real repo (settingSources:["project"], CLAUDE.md loaded) — should read
  // server/docs/api-contracts.md via server/CLAUDE.md's "Read when" routing. Control = identical
  // prompt, identical tools, but an empty tmpdir with settingSources:[] — no CLAUDE.md anywhere to
  // route from, so it structurally cannot read that file. Proves the routing rule is doing the
  // work, not just that a capable model happens to go looking for API docs on its own.
  {
    kind: "contrast",
    name: "CLAUDE.md routes a new-endpoint task to server/docs/api-contracts.md",
    prompt:
      "Я хочу додати новий REST-ендпоінт у server. Перш ніж писати код — за настановами цього репо " +
      "(CLAUDE.md) знайди й прочитай документ, де описані конвенції для нових ендпоінтів, і прочитай саме його.",
    expectFileRead: "server/docs/api-contracts.md",
    maxTurns: 5,
  },
];
