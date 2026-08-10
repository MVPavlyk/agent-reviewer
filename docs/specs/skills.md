# Skills — reusable prompt blocks for agents

**Status:** ✅ Implemented — all 9 PRs landed 2026-08-03. See
[Implementation log](#implementation-log) for what shipped, what deviated from
this plan, and what was added afterward that this spec never anticipated.
**Packages:** `server`, `client` — `reviewer-core` needed **no changes**
(confirmed: `reviewer-core/` had zero diff for the whole feature).
**Written:** 2026-08-02 · **Updated:** 2026-08-03

---

## Why

Agents are already configurable in the UI (model, system prompt, strategy), but the
**only** way to change an agent's behaviour is to rewrite its system prompt. There is no
way to lift a review criterion into a named, reusable block and share it across agents.

The groundwork already exists, laid down ahead of time:

- Tables `skills`, `skill_versions`, `agent_skills` are in
  [`0000_init.sql`](../../server/src/db/migrations/0000_init.sql) and
  [`schema/skills.ts`](../../server/src/db/schema/skills.ts). **No migration is needed.**
- Contracts `Skill`, `SkillType`, `SkillSource`, `AgentSkillLink` exist in **both**
  vendor copies ([server](../../server/src/vendor/shared/contracts/knowledge.ts),
  [client](../../client/src/vendor/shared/contracts/knowledge.ts)).
- `reviewer-core` is fully plumbed: `ReviewInput.skills` → `PromptParts.skills` →
  the `## Skills / rules` section → `PromptAssembly.skills`.
- The agent-binding API is live: `GET`/`POST /agents/:id/skills` plus
  `AgentsService.skillLinks/setSkills/linkSkill`.

**The hole is exactly in the middle.** There is no `modules/skills` on the server, no
`/skills` page on the client, and — critically —
[`run-executor.ts`](../../server/src/modules/reviews/run-executor.ts) never passes
`skills` into `reviewPullRequest`. So even a skill correctly linked to an agent today
**never reaches the prompt**.

**Outcome:** a user creates or imports skills in the UI, attaches them to agents in an
explicit order, and sees a distinct skills block with a token estimate in the run trace.
A control experiment demonstrates "no skills → miss" vs "with skills → flags it".

---

## Decisions

| # | Decision |
|---|---|
| 1 | `skills.enabled = false` excludes a skill from the prompt **everywhere**, even when the agent link remains. The resolver checks **both** flags. |
| 2 | API Contract Reviewer is a **second new agent**, symmetric to Test Quality Reviewer. |
| 3 | Import supports **both** a markdown file and an archive in this iteration. |
| 4 | Trace token counts are a **client-side estimate** (`~ceil(len/4)`); no contract change. |
| 5 | **No `wrapUntrusted`** — every skill enters the prompt as instructions regardless of `source`. Trust is UI copy and a talking point, not a mechanism. |
| 6 | URL import, the community catalog, and a `/skills/:id` route are **deferred**. Their unused i18n keys stay in place. |

### Accepted risk from decision 5 — stated plainly

An imported skill is third-party text that enters the prompt **as an instruction**, with
no `<untrusted>` fence and no forced `enabled = false`. A hostile skill can skew
severity, inject fabricated findings, or suppress real ones. The only defence is a human
reading the preview before saving.

One carve-out survives that decision: `sanitize()` still escapes `</untrusted>` inside a
skill body. That is **not** a restriction on the skill — it protects **neighbouring**
blocks. A skill body renders before `## Diff to review`, so a literal `</untrusted>`
inside it would close the diff's fence early. That is a prompt-integrity bug, not a
trust policy.

---

## Corrections to assumptions (verified against the code)

1. **The agent-binding server API is already complete.** The Skills tab in the agent
   editor is **pure client work** — zero new server endpoints.
2. **Cross-workspace hole:** `AgentsService.setSkills` validates the *agent*'s workspace
   but forwards `skillIds` to the repository unchecked, and `linkedSkills()` has no
   workspace filter. Single-tenant today, but this is precisely where a foreign body
   could enter an agent's prompt. Fix in PR 1.
3. **`assembly.skills` is a bare `join('\n\n')`**
   ([`prompt.ts:88`](../../reviewer-core/src/prompt.ts)) — per-skill boundaries are
   invisible in the trace. The acceptance criterion "an enabled skill appears as its own
   block" is satisfied by having the **server** format each body as `### <name>` before
   passing it. `reviewer-core` stays untouched.
4. **[`seed.ts:215`](../../server/src/db/seed.ts) inserts agents via raw `db.insert`**,
   bypassing the repository, so seeded agents get no `agent_versions` snapshot. Match
   that for the two new agents — consistency beats correctness here.
5. **[`client/messages/en/skills.json`](../../client/messages/en/skills.json) was written
   for a different flow** (`file | url | community`). It has no keys for archives, for
   the create-vs-import choice, for the description/type fields, for preview-confirm, or
   for reordering. New keys are required.
6. **`Toggle` in `vendor/ui` has no accessible name** (`role="switch"` with no label). A
   grid of skill cards with switches would be untestable in RTL and unusable with a
   screen reader. Add an optional `label?: string → aria-label`. Precedent: `Popover` was
   added to `vendor/ui` the same way.
7. **`Icon.Edit` does not exist** — the `IconName` union has `Pencil`. For reordering use
   `ArrowUp`/`ArrowDown` (there is no `ChevronUp`).

---

## Server

### `server/src/modules/skills/` — a vertical slice under the onion rule

| File | Ring | Contents |
|---|---|---|
| `routes.ts` | rim | Fastify + zod only. Module-level zod consts, `appBase.withTypeProvider<ZodTypeProvider>()`, one `new SkillsService(app.container)`, every handler opens with `getContext`, 404 via `NotFoundError`, POST → 201, DELETE → `{ok:true}`, snake_case bodies, no response schemas — mirroring [`agents/routes.ts`](../../server/src/modules/agents/routes.ts). |
| `service.ts` | application | Orchestration + invariants. snake_case↔camelCase via the `...(x !== undefined ? {x} : {})` idiom. Calls `sanitize()` on every body regardless of route, so an unsanitized body cannot be laundered through the plain `POST /skills`. |
| `repository.ts` | rim | Drizzle. `list/getById/insert/update/deleteById/listVersions/getVersion`. `insert` writes the row plus a v1 `skill_versions` snapshot; `update` snapshots **only when `body` changed**. Re-exports `SkillRow` from `db/rows.ts`. |
| `helpers.ts` | pure | `toSkillDto(row): Skill`, `isBodyChange(existing, patch)` — mirrors [`agents/helpers.ts`](../../server/src/modules/agents/helpers.ts). |
| `constants.ts` | pure | `INITIAL_SKILL_VERSION`, `MAX_BODY_CHARS`, `MAX_ARCHIVE_ENTRIES`, `MAX_ENTRY_BYTES`, `SKILL_DOC_NAMES = ['SKILL.md','skill.md','README.md']`, `TEXT_EXTENSIONS`. |
| `prompt-blocks.ts` | pure | `selectSkillBodies(links)` — the resolution business rule. See below. |
| `import/types.ts` | pure | `SkillFileEntry`, `SkillDraft`, `IgnoredEntry`, **and the `ArchiveReader` interface** — the port is declared next to its consumer; the implementation lives in `adapters/`. |
| `import/extract.ts` | pure | `extractSkill(entries: SkillFileEntry[]): SkillDraft`. No fs, no fflate, no Fastify. |
| `import/frontmatter.ts` | pure | ~30 lines parsing `---\nkey: value\n---`. Don't pull in gray-matter — we own the grammar. |
| `import/sanitize.ts` | pure | Escapes `</untrusted>`, strips control characters, caps length. |

No `domain.ts` — the onion skill explicitly says not to invent one until `service.ts`
earns it, and the pure logic already has a home under `import/`.

### Archive handling — split across two rings

This split is the whole point:

- **Decompression is a rim adapter.** `server/src/adapters/archive/{index.ts,fflate.ts}`
  implements `ArchiveReader` (`bytes → SkillFileEntry[]`), exposed as `Container.archive`
  with a `ContainerOverrides.archive` for tests. It is a third-party binary-format
  library — exactly like `depgraph`, `tokenizer`, and `astgrep`, which already sit in
  `adapters/` behind a container getter.
- **Extraction is pure core.** "Which entry is the skill, and what are its name,
  description, and type?" is the domain definition of a skill. It takes `{path, text}[]`
  and returns a draft. It is **structurally incapable** of executing anything, because it
  has no filesystem-shaped input.

Outside the slice: `db/rows.ts` (add `SkillRow`, `SkillVersionRow`, and replace the
inlined `typeof t.skills.$inferSelect` at
[`agents/repository.ts:47`](../../server/src/modules/agents/repository.ts)),
[`platform/container.ts`](../../server/src/platform/container.ts) (add `archive`), and
[`modules/index.ts`](../../server/src/modules/index.ts) (one import + one entry).
**Do not add `container.skillsRepo`** — no other module needs it.

### Import transport and library

**`fflate`** — pure TypeScript, zero dependencies, no native binary; `unzipSync` returns a
plain `{path: Uint8Array}` map. It is the only widely-used zip library that by design
never touches the filesystem. `.zip` only in this iteration.

**Transport is base64 in ordinary JSON, not `@fastify/multipart`.** Multipart is a new
transport with zero precedent in this codebase: [`client/src/lib/api.ts`](../../client/src/lib/api.ts)
always `JSON.stringify`s and has no FormData path, so multipart would mean adding a
parallel client transport too.

**The 1 MB body limit:** do **not** touch `app.ts:49`. Fastify supports a per-route
override:

```ts
app.post('/skills/import/preview', { bodyLimit: 4_000_000, schema: { body: ImportPreviewBody } }, ...)
```

Base64 inflates by 4/3, so a 4 MB budget accepts a ~3 MB archive. Every other route keeps
the global 1 MB cap.

### Why "nothing executable ran" is provable, not merely asserted

Four independently testable mechanisms:

1. **Nothing is written to disk.** `fflate.unzipSync` operates entirely in memory — no
   temp directory, no extraction path, no `fs` call. Grep-provable: `modules/skills/`
   imports neither `node:fs` nor `node:child_process`.
2. **The adapter filters before inflating.** `unzipSync(buf, { filter })` runs a predicate
   against each entry's header. Reject anything whose extension is not in
   `TEXT_EXTENSIONS`, whose `originalSize` exceeds `MAX_ENTRY_BYTES`, whose path contains
   `..` or is absolute (zip-slip), and everything past `MAX_ARCHIVE_ENTRIES`. A zip bomb
   is never inflated; `install.sh` is never read.
3. **The pure extractor has no path to execution** — its input is strings.
4. **Rejected entries are surfaced, not silently dropped.** The preview response carries
   `ignored_entries: [{path, reason}]` and the UI renders them. This turns an invisible
   negative ("nothing ran") into a visible positive ("we saw `install.sh` and refused
   it").

This is why the fixture archive deliberately contains a decoy `install.sh` — so
mechanism 4 has something to show.

### Import API — two steps, but stateless

```
POST /skills/import/preview
  body: { filename: string, content_base64: string }     // .md or .zip
  →    { draft: { name, description, type, body, source },
         ignored_entries: [{ path, reason }],
         warnings: string[] }

POST /skills                                             // the ordinary create route
  body: { name, description, type, body, source }
  → 201 Skill
```

Why no draft row: (a) no drafts table exists and adding one costs a migration, which this
spec otherwise avoids entirely; (b) the user edits the draft in the preview anyway, so a
server-side copy goes stale on the first keystroke; (c) nothing to garbage-collect;
(d) preview becomes a pure function of its input — trivially unit-testable and safe to
call repeatedly.

Cost: the body crosses the wire twice. Irrelevant at a few hundred KB.

### Resolving skills during a run

`ReviewRunExecutor` already takes `private agents: Container['agentsRepo']`
([`run-executor.ts:47`](../../server/src/modules/reviews/run-executor.ts)) and **never
uses it**. `AgentsRepository.linkedSkills(agentId)` already returns `{skill, order}[]`
sorted by `agent_skills.order`, with the full skill row including `body`, `enabled`, and
`source` — exactly the data required. This is not a layering violation: the comment in
`container.ts` states that shared repositories exist so consuming modules don't reach
into another module's folder.

The **rule** from decision 1 belongs neither in the repository nor inline in the executor.
It lives in a pure function, `modules/skills/prompt-blocks.ts`:

```ts
selectSkillBodies(links: LinkedSkillRow[]): string[]
```

— filters `skill.enabled === true`, sorts by `order`, formats each as
`### <name>\n<body>`, and returns `[]` when nothing qualifies. Reviews depends on the
skills **domain rule**, not on its infrastructure — which is exactly what onion permits.

Wiring, next to the existing context builders, after
[`run-executor.ts:183`](../../server/src/modules/reviews/run-executor.ts):

```ts
const skillBodies = selectSkillBodies(await this.agents.linkedSkills(agent.id));
```

and spread into the `reviewPullRequest` call after
[`run-executor.ts:203`](../../server/src/modules/reviews/run-executor.ts):

```ts
...(skillBodies.length ? { skills: skillBodies } : {}),
```

The empty-array guard is load-bearing: it preserves the existing "section omitted when
absent" contract, so `assembly.skills` stays `null` and the trace UI renders nothing —
which is precisely the acceptance criterion for a disabled skill.

Also emit a `runLog.info` with the count and names, so the Live Log is a second,
independent witness during the experiment.

**Nothing else changes.** The success path
([`run-executor.ts:275`](../../server/src/modules/reviews/run-executor.ts)) already sets
`prompt_assembly: outcome.assembly`. The hardcoded `skills: null` on line 430 is the
**failure** path (`traceFromBuffer`) and is correct as-is; likewise
`platform/trace-builder.ts::emptyPromptAssembly()`. **`reviewer-core` does not change at
all.**

---

## Client

### New route

```
client/src/app/skills/
  page.tsx                                   # thin; AppShell + SkillsListView
  _components/
    SkillsListView/{SkillsListView.tsx,styles.ts,constants.ts,index.ts,*.test.tsx}
    SkillCard/{SkillCard.tsx,styles.ts,index.ts,*.test.tsx}
    SkillPreviewPane/{SkillPreviewPane.tsx,styles.ts,index.ts}
    SkillForm/{SkillForm.tsx,styles.ts,constants.ts,index.ts,*.test.tsx}
    AddSkillDrawer/
      {AddSkillDrawer.tsx,styles.ts,constants.ts,index.ts}
      _components/ImportFromFile/{ImportFromFile.tsx,styles.ts,index.ts}
      _components/ImportPreview/{ImportPreview.tsx,styles.ts,index.ts,*.test.tsx}
```

**No `/skills/[id]` route** (decision 6). Selection is URL-owned state → `?skill=<id>`,
per the frontend-architecture rule that active tab / selected item live in search params,
not `useState`. This also matches the existing `?findingItem=` pattern recorded in
`client/INSIGHTS.md`.

Reuse `/agents` as a structural template: `AgentsListView` → `SkillsListView`,
`AgentCard` → `SkillCard`, and the two-pane layout from `/agents/[id]` (280px list column
+ flex detail) for "grid + side preview".

### Promote to shared — a second consumer now exists

Per "promote on the **second** consumer", with `components/findings-preview/` as
precedent:

1. **`client/src/components/skill-badges/`** — the type chip, source badge, and
   `needsVetting` badge. Both surfaces render all three.
2. **`client/src/components/skill-picker/`** — the search filter and skill row, shared by
   the `/skills` grid and the agent tab's attach list. The outer container stays local to
   each surface; their chrome differs too much.

**Do not promote `SkillForm`** — only `/skills` edits bodies.

### Hooks — `client/src/lib/hooks/skills.ts`

`"use client"`, thin wrappers over `api`, mirroring
[`hooks/agents.ts`](../../client/src/lib/hooks/agents.ts):
`useSkills()` `["skills"]` · `useSkill(id)` `["skill", id]` · `useCreateSkill` ·
`useUpdateSkill` · `useDeleteSkill` · `useImportSkillPreview` (mutation, uncached) ·
`useAgentSkills(agentId)` `["agent-skills", agentId]` · `useSetAgentSkills`.
Explicit named re-exports in `hooks/index.ts` — never `export *`.

Base64 is produced client-side via `FileReader.readAsDataURL` with the prefix stripped.
`api.ts` is unchanged — this is a plain JSON POST.

### Skills tab in the agent editor

`.../AgentEditor/_components/SkillsTab/{SkillsTab.tsx,styles.ts,constants.ts,index.ts,*.test.tsx}`

Three wiring points:

- `AgentEditor/constants.ts` — add
  `{ key: "skills", labelKey: "editor.tabs.skills", icon: "Sparkles" }`. The key
  `editor.tabs.skills` already exists in `agents.json`, as does a whole `skills.*` block
  (`title`, `enabledCount`, `filterPlaceholder`, `orderHint`).
- [`client/src/app/agents/[id]/page.tsx`](../../client/src/app/agents/[id]/page.tsx) —
  `VALID_TABS` becomes `["config", "skills"]`.
- [`AgentEditor.tsx`](../../client/src/app/agents/[id]/_components/AgentEditor/AgentEditor.tsx)
  — render by `tab`.

`GET /agents/:id/skills` returns only `{agent_id, skill_id, order}` — no name or type.
Join it client-side against `useSkills()` (which the tab fetches anyway for the attach
list): a pure function, and one fewer contract change.

**`AgentEditor.test.tsx` must be updated in the same PR.** Per `client/INSIGHTS.md`, a
test's `NextIntlClientProvider` only carries the namespaces it is handed — `SkillsTab`
pulls the `skills` namespace, so the existing test breaks silently-late. It also needs a
`QueryClientProvider` (or a `vi.mock` of the hooks module).

### Reordering without a DnD library

Move-up / move-down `IconBtn`s (`ArrowUp`/`ArrowDown`), each with an `aria-label` naming
the skill, `disabled` at the ends. On click, compute the new order with a pure
`moveItem(arr, from, to)` and call `useSetAgentSkills` with the full `skill_ids`: the
existing `POST /agents/:id/skills` already replaces the whole ordered set with
`order = index`, so **no new API is needed**.

- `key={link.skill_id}`, **never the index** — the list reorders.
- **Derive, don't store**: do not mirror the order into `useState`; render straight from
  query data and let the mutation's `onSuccess` invalidate.
- `disabled` while `isPending` — this both prevents double-submit and **mitigates 40P01**:
  `setSkills` has exactly the DELETE-then-INSERT shape that caused the repo-intel
  deadlock. Risk is lower here (PK is `(agent_id, skill_id)`, so the delete is scoped to
  one agent), but additionally wrap `setSkills` in `db.transaction`.

Native `draggable` is rejected: ~80 lines of plumbing, effectively untestable in jsdom,
and strictly **less** accessible than buttons.

### Navigation and i18n

[`client/src/vendor/ui/nav.ts`](../../client/src/vendor/ui/nav.ts) — add a group above
`WORKSPACE`:

```ts
{ section: "SKILLS LAB", items: [{ key: "skills", label: "Skills", icon: "Sparkles", href: "/skills", gKey: "s" }] }
```

`activeKeyFor()` in `components/app-shell/helpers.ts` already maps `/skills` → `"skills"`,
so no change there. Add `g s` to `SHORTCUTS`. Labels in this vendored file are hardcoded
English — keep it that way rather than i18n-ing a single entry.

New keys in `skills.json`: `page.menu.create`; `drawer.tabs.*` (the set becomes
`create | import`); `form.*` (`nameLabel`, `descriptionLabel`, **`descriptionHint`** — the
caption stating that a description should be phrased imperatively, a product requirement,
so pin it with a test — `typeLabel`, `bodyLabel`); `import.*` (`accepted`, `ignoredTitle`,
`ignoredReason.*`, `confirm`, `cancel`); `reorder.*` (`moveUp`, `moveDown`). The `url.*`
and `community.*` blocks stay unused.

### Tokens in the trace

`PromptBlock` already receives `text`. Add an optional `tokens?: number`
(`Math.ceil(text.length / 4)`) and render it as a subtitle, `~1,240 tokens` — for **every**
prompt block, not just skills. Zero contract changes, zero server changes, and the
`INSIGHTS.md` trap (a required field on a shared contract breaks every hand-built
`.parse()` fixture in **both** vendor copies) never fires.

Label it honestly: it is an **estimate** (`~`), and it is "tokens **in** this block", not
"tokens **added by** this block". The real delta is the two-run `stats.tokens_in`
comparison that the control experiment already produces.

---

## Seeding and the control experiment

**Two agents (seed).** Append to `seedAgents` in
[`server/src/db/seed.ts`](../../server/src/db/seed.ts), with prompt bodies in
`seed-prompts.ts` as `TEST_QUALITY_REVIEWER_PROMPT` and `API_CONTRACT_REVIEWER_PROMPT`,
mirrored into `docs/agent-prompts/*.md`. Keep the existing idempotent-by-name guard.

**Most skills (seed).** 3–4 skills with `source: 'manual'`, `enabled: true`, plus their
links, idempotent on `(workspaceId, name)`. Needed so the experiment reproduces from a
clean DB and so e2e has data to read.

**At least one skill must go through a real import** — this cannot be a seed INSERT
without failing the acceptance criterion. Two parts:

- **The human demonstration.** Check a fixture into the repo,
  `docs/skills/api-contract-rubric/` containing `SKILL.md`, `README.md`, and a **decoy
  `install.sh`**, zipped. A human uploads it through the UI once, sees `install.sh` listed
  under ignored entries, confirms, then links it to API Contract Reviewer. That is the
  end-to-end proof, and the decoy is what makes "nothing executable ran" *visible*.
- **The CI-repeatable proof.** `server/test/skills-import.it.test.ts` posts the same bytes
  to `/skills/import/preview` then `/skills` and asserts the created row plus
  `ignored_entries`.

The seed must **not** insert the imported skill. Its absence from a clean DB is the honest
signal that it came from a human action.

### What the experiment needs to reproduce

1. **Frozen inputs** — two fixture diffs in the repo
   (`docs/experiments/skills/happy-path-test.diff`, `route-signature-change.diff`), not
   live PRs, which drift.
2. **One variable** — same agent, same model, same diff, run twice: skills **globally
   disabled**, then enabled. Toggle `skills.enabled` rather than unlinking; that exercises
   decision 1 and leaves the links intact, so the trace difference is unambiguous.
3. **Determinism** — pin `temperature: 0` if the LLM adapter exposes it; otherwise say so
   and run each cell 2–3 times.
4. **Recorded output** — `docs/experiments/skills/RESULTS.md`: run id, `stats.tokens_in`,
   finding count, and whether `prompt_assembly.skills` was null.
5. **An honest caveat** — this is a demonstration, n=1 per cell against a
   non-deterministic model. It is not a statistically valid eval. Say it out loud.

---

## Tests

**Server unit (hermetic, `server/test/`)**

- `skills-extract.test.ts` — the pure extractor: `SKILL.md` nested at depth;
  name/description/type from frontmatter; fallback to the sole `.md`;
  `install.sh` / `.js` / binaries land in `ignored` with a reason; an oversized entry is
  rejected pre-inflate; `</untrusted>` escaped; body capped.
- `skills-prompt-blocks.test.ts` — **the test that encodes decision 1**: a linked but
  globally disabled skill is excluded; order is respected; all-disabled → `[]` so the
  section is omitted.
- Extend the existing `routes-smoke.test.ts` and `adapters.test.ts`.

**Server integration (`*.it.test.ts`, modelled on `agents-versions.it.test.ts`)**

- `skills-crud.it.test.ts` — 201; list is workspace-scoped; PUT bumps `version` and writes
  a `skill_versions` row **only** when `body` changed (a name-only edit must not bump);
  DELETE → `{ok:true}`; 404 envelope shape.
- `skills-import.it.test.ts` — preview→create on the real fixture bytes;
  `ignored_entries` contains `install.sh`.
- `agent-skills.it.test.ts` — link, reorder, repeated `setSkills` is stable, **a skill
  from another workspace is rejected** (correction 2).
- `review-skills.it.test.ts` — **the test that proves the feature.** Inject a mock LLM via
  `ContainerOverrides.llm` that captures its messages. Run a review for an agent with two
  linked skills, one globally disabled. Assert the persisted
  `run_traces.prompt_assembly.skills` contains the enabled skill's name and **not** the
  disabled one, and is `null` when the agent has no enabled skills. This **is** the
  acceptance criterion "an enabled skill appears as its own block, a disabled one does
  not".

**`reviewer-core` — no changes, no new tests.**

**Client (colocated, vitest + RTL)** — `SkillCard` (render + Toggle; needs the
`aria-label` fix), `SkillsListView` (filter, empty state, `?skill=`, the Add menu),
`SkillForm` (**asserts the description caption is present** — a product requirement, so
pin it), `ImportPreview` (extracted name/body, the ignored-entries list, the trust
notice), `SkillsTab` (attach, reorder, disabled at the ends), the **updated**
`AgentEditor.test.tsx`, and an extended `RunTraceDrawer.test.tsx` (skills block present /
absent / shows `~N tokens`).

**e2e** — `e2e/specs/NN-skills.flow.json`, read-only against seeded data with no model
call: open `/skills`, `wait --text` on a seeded skill name, navigate to an agent's
`?tab=skills`, `wait --text` on the `orderHint` string.

---

## PR sequence

| # | Status | PR | Depends on | Why here |
|---|---|---|---|---|
| 1 | ✅ | **Server skills module — CRUD only.** `modules/skills/{routes,service,repository,helpers,constants}.ts`, `db/rows.ts`, the `agents/repository.ts:47` cleanup, the `modules/index.ts` entry, the workspace-scoping fix in `setSkills`. | — | Foundation; no UI, fully testable via `inject()`. |
| 2 | ✅ | **Prompt wiring.** `prompt-blocks.ts` (pure) + resolution in `run-executor`. | 1 | **Ships the actual feature before a single pixel exists.** Its integration test closes the headline acceptance criterion. |
| 3 | ✅ | **Import.** `adapters/archive/` (fflate) + container getter, `modules/skills/import/*`, `POST /skills/import/preview` with a per-route `bodyLimit`, the fixture archive. | 1 | Independent of the UI; the pure extractor is the highest-value unit-test surface in the feature. |
| 4 | ✅ | **Client: hooks + `/skills` page.** `lib/hooks/skills.ts`, `components/skill-badges/`, `components/skill-picker/`, grid + preview + create/edit, the `Toggle` `aria-label` fix, i18n. | 1 | First pixels. |
| 5 | ✅ | **Client: import drawer + preview UI**, including the ignored-entries list. | 3, 4 | |
| 6 | ✅ | **SkillsTab.** Three wiring points, attach/reorder, the NAV entry + shortcut, **the `AgentEditor.test.tsx` update**. | 4 | Also picked up the `setSkills` `db.transaction` wrap and `Toggle`/`IconBtn` `disabled` support, both called for in this spec's body text but not itemized as their own line. |
| 7 | ✅ | **Trace token estimate.** `PromptBlock` subtitle, extended `RunTraceDrawer.test.tsx`. | 2 | Tiny and isolated. |
| 8 | ✅ | **Seed + e2e.** Two agents + prompts + `docs/agent-prompts/*.md`, seeded skills and links, the e2e flow. | 1, 3 | Needs the import fixture to exist. |
| 9 | ✅ | **Control experiment.** Fixture diffs, a runner script, `RESULTS.md`, the human import walkthrough, `INSIGHTS.md` entries (server + client). | all | Ran for real against a live model — see the log below. |

The 1→2 ordering is the important one: the feature becomes provable before the first
component is written. That held: PR 2's `review-skills.it.test.ts` closed the
acceptance criterion while `/skills` still 404'd.

---

## Implementation log

What actually happened on 2026-08-03, versus what this plan predicted — read
this before trusting the sections above as current-state fact; they're the
**plan**, this is the **record**.

- **All 9 PRs landed in one continuous session**, not as 9 separate reviewed
  PRs — the numbering above is preserved because it's still the right unit of
  work to point someone at ("read the PR-2 section to understand prompt
  wiring"), not because 9 GitHub PRs were opened.
- **`reviewer-core` stayed untouched**, exactly as decided.
- **PR 9's control experiment ran for real, not mocked.** This dev machine had
  a configured `OPENROUTER_API_KEY`, so `server/scripts/run-skills-experiment.ts`
  made genuine `openrouter/deepseek-v4-flash` calls instead of a stubbed LLM.
  Result: `prompt_assembly.skills` presence/absence was exact in all 4 cells
  (the pipeline fact); the model's verdict did **not** change on the
  route-signature-change diff because `API Contract Reviewer`'s own system
  prompt already covers that pattern — a linked skill reinforced an existing
  instruction rather than filling a gap. `tokens_in` also turned out to be an
  **unreliable** signal in practice (provider-side prompt-caching artifact).
  Full writeup: [`docs/experiments/skills/RESULTS.md`](../experiments/skills/RESULTS.md).
- **The e2e flow (`e2e/specs/08-skills.flow.json`) was written but never run
  live** in this environment — no `agent-browser` CLI installed, no running
  dev stack. It's JSON-valid and the package typechecks; running it for real
  is the reader's job (`./scripts/e2e.sh`).
- **The manual UI walkthrough (Verification section, steps 1–6 below) was not
  performed** — `client/CLAUDE.md` forbids driving the app with a browser tool
  to "verify" a change; only automated tests were run.
- **Test counts at completion:** server 30 files / 174 tests (`pnpm exec
  vitest run`), client 21 files / 95 tests (`pnpm test`), `reviewer-core` 3
  files / 23 tests (untouched, still green). All three `pnpm typecheck` clean.
- **Post-spec addition — field-level validation error UX.** Not anticipated by
  this spec at all: create/edit skill forms surfaced a failed `POST`/`PUT
  /skills` only as a generic toast, with no indication of *which* field was
  wrong. Added afterward, on direct user feedback:
  - `vendor/ui/kit/FormField.tsx` gained an `error?: React.ReactNode` prop
    (renders in place of `hint`, `role="alert"`); `TextInput`/`Textarea`/
    `SelectInput` gained `invalid?: boolean` (red border).
  - `client/src/lib/form-errors.ts#fieldErrors(err)` parses a 422
    `ApiError.details` (fastify-type-provider-zod's
    `{instancePath: "/name", message}[]`, with a raw-`ZodError` `path[]`
    fallback) into `{fieldName: message}`.
  - Wired into `SkillForm`, `AddSkillDrawer` (both the create tab and the
    import-confirm step), and `SkillPreviewPane`'s body save — each clears the
    stale message the moment the user edits that field again.
  - **Not** retrofitted onto `CreateAgentModal` or `ConfigTab` — they still
    rely solely on the global toast. `toast.tsx`'s comment already stated a
    "form errors → inline" taxonomy as the intent; this is the first form to
    actually implement it. Reuse `FormField`'s `error` prop + `fieldErrors()`
    for the next form that needs this rather than re-inventing it.

---

## Verification

After PR 2, with no UI yet:

```bash
cd server && pnpm exec vitest run .it.test -t "review-skills"
```

That alone proves: an enabled skill appears in `prompt_assembly.skills`, a disabled one
does not, and the field is `null` when none are enabled.

Full server run:

```bash
cd server && pnpm exec vitest run --exclude '**/*.it.test.ts' && pnpm typecheck
```

Client (per `client/CLAUDE.md`, do **not** drive the app with a browser tool):

```bash
cd client && pnpm test && pnpm typecheck
```

**Actual results (2026-08-03):** server 30 files / 174 tests, client 21 files /
95 tests, both `pnpm typecheck` clean, `reviewer-core` 3 files / 23 tests
unchanged and still green.

Manual walkthrough (`./scripts/dev.sh`) — **not performed** in this session
(see the Implementation log); still the checklist to run before calling this
feature done end-to-end:

1. `/skills` → create a skill, check the description caption, save, edit → `v2`.
2. Add → Import → upload `docs/skills/api-contract-rubric.zip` → the preview shows the
   extracted `SKILL.md` **and `install.sh` under ignored entries** → confirm.
3. Agent → `?tab=skills` → attach, reorder.
4. Run Review on a fixture diff → Run trace → Prompt assembly → a **Skills** block with
   `~N tokens`.
5. Disable the skill on `/skills` → run again → the Skills block is **gone**.
6. Both experiments on both agents; results in `docs/experiments/skills/RESULTS.md`
   — **already ran for real** against a live model (see Implementation log), so
   this step is really "re-run and compare" rather than a first execution.
7. **New, not in the original checklist:** on `/skills`, try to create a skill
   with an empty body → confirm the "Skill body (Markdown)" field itself shows
   the server's message (not just a toast) and gets a red border.

At the end: run `/pr-self-review` manually (auto-invocation stays off) and record entries
via `engineering-insights` in `server/INSIGHTS.md` and `client/INSIGHTS.md`. **Done** for
this session — see both files' `## Session Notes` / `## Codebase Patterns` entries
dated 2026-08-03; `/pr-self-review` itself was left for the human to run before
opening a PR.

---

## Extension — detail tabs + Stats

**Status:** 📋 Planned — not started. **Packages:** `server`, `client`.
**Written:** 2026-08-03.

New design mockups replace `/skills`' single-pane `SkillPreviewPane` with a
tabbed detail view (**Config · Preview · Stats · Versions**), plus a small
usage line on each `SkillCard` (`3 agents · 71% pull · 74% accept`).
**No Evals tab** — explicitly excluded (no eval-running infra for skills;
`EvalCase`/`EvalRun` contracts in `knowledge.ts` stay unused for skills, same
as `CommunitySkill` and the `url`/`community` i18n blocks above).

This is a real feature addition, not a visual refresh: **Stats** and
**Versions** need server data that doesn't exist yet. Skills aren't linked to
the runs/findings that used them, and version history
(`skill_versions`, already written by `SkillsRepository.insert`/`update`) has
no route or client hook even though the rows exist.

### Decisions

| # | Decision |
|---|---|
| E1 | Tab state is `?tab=` alongside the existing `?skill=` in `SkillsListView`, same URL-owned-state rule as decision area for `?skill=` above. Default `config`. |
| E2 | **Restore is copy-forward, never rewrite.** "Restore v4" (when current is v5) creates v6 with v4's body — reuses the existing `update()` bump/snapshot path unchanged. History is never lost. |
| E3 | New nullable, free-text, **user-entered** `change_summary` column on `skill_versions`. No LLM auto-summarization. |
| E4 | **Stats attribution is approximate, and the UI says so.** Findings are never LLM-tagged to a specific skill (would need a prompt/schema change — out of scope). A new `run_skills` join table records which skills (and which skill *version*) were active on a run; findings/cost are attributed via `findings → reviews → run_skills`, with a run's `cost_usd` split evenly across its findings. Same honesty convention as the `~N tokens` estimate label above. |
| E5 | Findings-by-category breakdown window is a fixed **last 30 days** (matches the mockup's "FINDINGS (30D)"); agents-count / pull-rate / accept-rate are **all-time**. No date-range picker in v1. |
| E6 | **`container.skillsRepo` is now added** — reversing the original "no other module needs it" call above, because a second consumer now exists: `ReviewRunExecutor` must persist `run_skills` at the exact point it already resolves `linkedSkills` (`run-executor.ts:192`). Precedent already exists: the executor already takes `Container['agentsRepo']` and imports `selectSkillBodies` from `modules/skills/prompt-blocks.js`. |
| E7 | `SkillCard`'s stat line is served by the existing `GET /skills` list response (one aggregate join for the whole list), **not** a per-card fetch — avoids N+1. The heavier category/cost breakdown stays behind `GET /skills/:id/stats`, fetched only for the selected skill. |
| E8 | No new diff dependency. `client/src/components/diff-viewer/` is GitHub-unified-diff-specific (`PrFile.patch`) and doesn't fit two markdown bodies — a small local line-diff util instead of pulling in the `diff` npm package. |

### Contracts

Server (`server/src/vendor/shared/contracts/knowledge.ts`) first, mirror the
UI-relevant subset to client per root CLAUDE.md:

- `Skill` — add `agents_count: number`, `pull_rate: number (0-1)`,
  `accept_rate: number (0-1)` (list-cheap, computed alongside the base row).
- New `SkillVersion`: `{ skill_id, version, body, change_summary: string |
  null, created_at }`.
- New `SkillStats`: `{ agents_count, pull_rate, accept_rate,
  findings_by_category: { category: FindingCategory, count, cost_usd }[],
  total_cost_usd, window_days }` — reuses `FindingCategory` from
  `findings.ts`, no redeclaration.

### Database migration

Edit schema, then `pnpm db:generate` from `server/` — never hand-edit
`server/src/db/migrations/*`/`meta/`.

- `server/src/db/schema/skills.ts`: `skillVersions` gains nullable
  `changeSummary: text('change_summary')`.
- New table `runSkills` in `server/src/db/schema/runs.ts` (next to
  `agentRuns`, which it FKs to): `runId`, `skillId`, `skillVersion` (snapshot
  of `skills.version` at run time), composite PK `(runId, skillId)`, indexed
  on `skillId` for stats queries — mirrors the `agent_runs_*_idx` style
  already in that file.

### Server (onion: routes=rim, service=application, repository=rim)

All in `server/src/modules/skills/` — stats/versions are more skill-scoped
queries, not a new bounded context.

1. `platform/container.ts` — lazy `skillsRepo` getter, mirroring `agentsRepo`
   exactly (decision E6).
2. `repository.ts` — `insertRunSkills(runId, links)` (bulk insert,
   `onConflictDoNothing`, same idiom as `snapshotVersion`); extend
   `list()`/`getById()` with the agents-count/pull-rate/accept-rate join,
   mirroring the `sum()` pattern in `server/src/modules/pulls/repository.ts:157-163`;
   `getStats(skillId, windowDays)` joining
   `findings → reviews → run_skills`, grouped by category, cost apportioned
   as `agent_runs.cost_usd / agent_runs.findings_count` per finding.
3. `service.ts` — `listVersions`, `restoreVersion(workspaceId, id, version)`
   (loads the old snapshot via existing `getVersion`, calls `repo.update()`
   with that body — reuses the bump/snapshot path as-is), `getStats`.
4. `routes.ts` — `GET /skills/:id/versions`, `POST
   /skills/:id/versions/:version/restore`, `GET /skills/:id/stats`, all
   zod-validated like the existing handlers.
5. `modules/reviews/run-executor.ts` — constructor gains a `SkillsRepository`
   param (threaded from `modules/reviews/service.ts:36` via
   `container.skillsRepo`); right after the existing `linkedSkills` call
   (line 192), persist `run_skills` for the resolved links.

### Client

1. New `client/src/app/skills/_components/SkillDetailTabs/` replaces the
   direct `SkillPreviewPane` render in `SkillsListView`:
   `SkillDetailTabs.tsx` (renders `Tabs` from `@devdigest/ui`, switches body
   by tab key, same `key={skill.id}` remount idiom as `AgentEditor.tsx`),
   `constants.ts` (`TABS` — config/preview/stats/versions, no evals),
   `ConfigTab/` (today's `SkillPreviewPane` content moved in as-is),
   `PreviewTab/` (new — `<Markdown>{skill.body}</Markdown>`, reusing
   `vendor/ui/primitives/Markdown.tsx` exactly as `FindingCard`/`CommentCard`
   already do), `StatsTab/` (new — the stat cards + category breakdown + the
   approximate-attribution caveat, via new `useSkillStats(id)`),
   `VersionsTab/` (new — version rows with Diff/Restore, relocating the
   existing `<Badge>{"v{version}"}</Badge>` from `SkillPreviewPane` as the
   header chip; `diff.ts` local line-diff util per decision E8).
2. `SkillsListView.tsx` — `?tab=` read/write mirroring
   `agents/[id]/page.tsx`'s `VALID_TABS` pattern; passes `tab`/`setTab` to
   `SkillDetailTabs` instead of rendering `SkillPreviewPane` directly.
3. `client/src/lib/hooks/skills.ts` — add `useSkillVersions(id)`,
   `useRestoreSkillVersion()`, `useSkillStats(id)`; named exports through
   `hooks/index.ts`, never `export *`.
4. `SkillCard.tsx` — stat line under `metaRow`, reading
   `agents_count`/`pull_rate`/`accept_rate` straight off `useSkills()` data
   (decision E7 — no extra fetch).
5. i18n (`client/messages/en/skills.json`) — the unused `detail.*` namespace
   (leftover from the deferred `/skills/:id` route) gets
   `detail.tabs.{config,preview,stats,versions}`; new `stats.*`,
   `versions.*`, and extended `listItem.*`/`card.*` for the stat line.

### Tests

- Server unit: pure aggregation math (category grouping, even cost split) —
  new `server/test/skills-stats.test.ts`.
- Server integration: extend `skills-crud.it.test.ts` (or new
  `skills-versions.it.test.ts`) for the versions/restore routes (asserts a
  **new** version row, never an overwrite); extend `review-skills.it.test.ts`
  (or new `run-skills.it.test.ts`) to assert a `run_skills` row per linked
  skill after a run; new `skills-stats.it.test.ts` end-to-end against seeded
  findings/runs.
- Client RTL: `SkillDetailTabs.test.tsx` (tab switching, URL sync),
  `VersionsTab.test.tsx` (restore call, diff render, disabled on current
  version), `StatsTab.test.tsx` (caveat text, percentage/cost formatting),
  extend `SkillCard.test.tsx` for the stat line.

### Verification

```bash
cd server && pnpm db:generate && pnpm db:migrate
cd server && pnpm exec vitest run --exclude '**/*.it.test.ts' && pnpm exec vitest run .it.test -t skills && pnpm typecheck
cd client && pnpm test && pnpm typecheck
```

Manual: `/skills` → select a skill → cycle Config/Preview/Stats/Versions →
run a review for an agent with linked skills → confirm a `run_skills` row
landed (Stats tab's agents-count bumps) → edit a version's body with a
change summary → restore an older version → confirm it lands as a **new**
version, not an overwrite.

### Extension out of scope

- Evals tab / eval-running for skills.
- Precise (non-approximate) finding→skill attribution (needs an LLM
  prompt/schema change).
- Date-range picker for Stats.
- The rest of the mockup's SKILLS LAB sidebar (Conventions, Eval Dashboard,
  Memory, Multi-Agent Review, Agent Performance, CI Runs) — none of those
  pages exist yet; separate, much larger effort.

---

## Out of scope

- Import from URL and the community skill catalog (i18n keys exist; deferred).
- A `/skills/:id` detail route — a side preview via `?skill=<id>` covers the requirement.
- `.tar.gz` archives — `.zip` only.
- Per-section token counts persisted on `PromptAssembly` (client-side estimate instead).
- Any change to `reviewer-core`.
- Still out of scope after implementation: live e2e execution in CI/local (flow file
  exists, untested end-to-end here), the manual UI walkthrough above, and retrofitting
  the new field-level validation error UX (see Implementation log) onto
  `CreateAgentModal`/`ConfigTab`.

## Key files

| File | Role |
|---|---|
| [`server/src/modules/reviews/run-executor.ts`](../../server/src/modules/reviews/run-executor.ts) | Resolution after :183, spread after :203 |
| [`server/src/modules/agents/repository.ts`](../../server/src/modules/agents/repository.ts) | Reuse `linkedSkills`; clean up `:47`; `setSkills` transaction |
| [`server/src/modules/agents/service.ts`](../../server/src/modules/agents/service.ts) | Workspace-scoping fix in `setSkills` |
| [`server/src/platform/container.ts`](../../server/src/platform/container.ts) | `archive` getter |
| [`server/src/modules/index.ts`](../../server/src/modules/index.ts) | Module registration |
| [`reviewer-core/src/prompt.ts`](../../reviewer-core/src/prompt.ts) | Read it; **do not change it** (confirmed unchanged) |
| [`client/src/app/agents/[id]/_components/AgentEditor/AgentEditor.tsx`](../../client/src/app/agents/[id]/_components/AgentEditor/AgentEditor.tsx) · [`page.tsx`](../../client/src/app/agents/[id]/page.tsx) | The two tab-wiring points |
| [`client/src/vendor/ui/nav.ts`](../../client/src/vendor/ui/nav.ts) | SKILLS LAB nav group |
| [`server/scripts/run-skills-experiment.ts`](../../server/scripts/run-skills-experiment.ts) | Not in the original plan — the PR 9 runner script itself |
| [`docs/experiments/skills/RESULTS.md`](../experiments/skills/RESULTS.md) | The actual (real-model) experiment output |
| [`client/src/lib/form-errors.ts`](../../client/src/lib/form-errors.ts) | Post-spec addition — field-level validation error parsing |
| [`client/src/vendor/ui/kit/FormField.tsx`](../../client/src/vendor/ui/kit/FormField.tsx) | Post-spec addition — `error` prop |
