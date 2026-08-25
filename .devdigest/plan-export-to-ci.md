# Implementation Plan: Export to CI (SPEC-05 server + SPEC-06 UI)

> Branch: `feat/export-to-ci`. Specs: `specs/server/SPEC-05-export-to-ci-server.md`,
> `specs/client/SPEC-06-export-to-ci-ui.md`. Designs: `.devdigest/design-export-to-ci/`.

## Locked decisions (from user)
- GitHub Actions ONLY; other targets are disabled "coming soon" placeholders.
- Install = "Copy files as a zip" only; "Open a PR" is a disabled stub (no GitHub write).
- DO NOT modify `agent-runner/` or the `ci/` runner (scope #3). Feature only generates
  config referencing `node .devdigest/runner/index.js` and reads outcomes.
- CI-runs ingest OUT OF SCOPE: feature never writes `ci_runs`; pills + CI Runs page
  render over existing data only, correct empty-state.
- Runner-bundle missing on disk → **export returns 5xx "runner not built"** (do NOT
  build the runner, do NOT ship a placeholder). Default bundle path: `agent-runner/dist/index.js` from repo root.
- Spec numbering stays server=05 / client=06.
- Persistence/contracts already exist (`ci_installations`, `ci_runs`, `agents.ci_fail_on`,
  `Ci*`/`AgentManifest` contracts server + mirrored client) → NO new migration.

## Chunk breakdown (≤5 implementer passes, dependency order)
- **A** server: `ci` module (routes/service/repository + manifest/workflow/bundle/paths) + DI `RunnerBundle` port + `ciRepo` + registration. read-only `ci_runs`.
- **B** client: `lib/hooks/ci.ts` + barrel + zip util (`fflate`).
- **C** client: Export wizard (Target→Preview→Configure→Install + zip).
- **D** client: CI tab in `AgentEditor` (pill, Fail CI on, installations list, wizard mount).
- **E** client: nav GLOBAL group + CI Runs page/view.

Deps: A → B; B → C,D,E; C → D.

## Review/verify plan
- architecture-reviewer after Chunk A (server onion/boundaries) and after Chunk E (whole client).
- plan-verifier: structural after A and after E; full at the very end.

---

## Chunk A — server steps

### Step 1.1 — module scaffold
Files: `server/src/modules/ci/{routes,service,repository}.ts` (new).
Skills: fastify-best-practices, zod, onion-architecture, drizzle-orm-patterns, import-hygiene.
Done when: three files created, empty plugin default-exports and typechecks.

### Step 1.2 — CiRepository (persist installations + read ci_runs)
File: `server/src/modules/ci/repository.ts`.
- upsert `ci_installations` on (agent_id, repo) no dup (AC-11); `listInstallations(workspaceId, agentId)` with last-run status; `listRuns(workspaceId)`.
- workspace-scoping via join to `agents` (AC-22); NEVER write ci_runs (AC-18); tolerate `ci_installation_id=null` (EC-7); coerce numeric aggregates with Number() (server/INSIGHTS).
Skills: onion-architecture, drizzle-orm-patterns, postgresql-table-design, import-hygiene.
Done when: repeat upsert doesn't multiply rows; listRuns sorts ran_at desc, returns [] when none; foreign workspace sees nothing.

### Step 1.3 — CiService (bundle generation, pure domain)
Files: `server/src/modules/ci/service.ts` + pure `server/src/modules/ci/{manifest,workflow,bundle}.ts` (new as needed).
- `exportCi(input, agent, skills, runnerBundle) → CiExport`.
- YAML serializer (not string concat) for manifest (EC-5); `skills` = slugs in `order` (AC-5); one `.devdigest/skills/<slug>.md` with resolved body (AC-6).
- workflow: `on.pull_request.types`=triggers, `runs-on: ubuntu-latest`, checkout@v4 + setup-node@v4 (node 20), step `node .devdigest/runner/index.js` + env OPENROUTER_API_KEY / conditional GITHUB_TOKEN / GITHUB_REPOSITORY / PR_NUMBER / DEVDIGEST_POST_AS (AC-7/AC-8).
- include `.devdigest/runner/index.js`, EXCLUDE `.devdigest/memory.jsonl` (AC-9); `target≠gha`→error (AC-12); `action:'open_pr'`→`pr_url:null`, persist skipped (AC-13/EC-6); `ci_fail_on` from `agent.ci_fail_on` (AC-16); NO network (EC-8/NFR-1); contents carry no secret values, only `secrets.*`/env refs (AC-21).
- runner bundle absent → surface a typed error so routes return 5xx "runner not built".
Skills: onion-architecture, zod, typescript-expert, import-hygiene.
Done when: YAML passes AgentManifest.safeParse; workflow has real runner call + all env; no-skills agent → skills:[], 0 skill files (EC-1); single trigger → valid YAML (EC-3); YAML-special system_prompt serializes correctly (EC-5).

### Step 1.4 — untrusted input validation (paths/repo)
Files: `server/src/modules/ci/{service,manifest}.ts` + `server/src/modules/ci/paths.ts` (new as needed).
- `repo` regex `owner/name` before any path/URL use, never raw in shell/path (AC-20); sanitize/reject unsafe slugs (`..`/absolute/special) (AC-10/EC-4); every `CiFile.path` relative + normalized.
Skills: security, typescript-expert, zod.
Done when: bad `repo` rejected; slug with `../` rejected/sanitized; no path contains `..`/absolute segment.

### Step 1.5 — DI: RunnerBundle port + adapter + ciRepo
Files: `server/src/platform/container.ts` (getters `runnerBundle`, `ciRepo`, `ContainerOverrides.runnerBundle`), `server/src/adapters/runner-bundle/*` (new adapter reads `.devdigest/runner/index.js` from configured path; port interface declared by the consuming service), `server/src/adapters/index.ts` (export), `server/src/platform/config.ts` (bundle path, default `agent-runner/dist/index.js` from repo root).
- adapter constructed ONLY in container (AC-2); service depends on `RunnerBundle` interface, not fs; test stubs bundle via ContainerOverrides (no real dist/); missing bundle → error that becomes 5xx at route.
Skills: onion-architecture, import-hygiene, typescript-expert.
Done when: container.runnerBundle/ciRepo resolve; service unit test runs with stub bundle; typecheck green.

### Step 1.6 — routes + registration
Files: `server/src/modules/ci/routes.ts`, `server/src/modules/index.ts` (add `ci`).
- `POST /agents/:id/export-ci` (body CiExportInput via fastify-type-provider-zod, default body via `z.preprocess((v)=>v??{}, ...)` — server/INSIGHTS; AC-14); `GET /agents/:id/ci` (AC-15); `GET /ci/runs` (AC-17).
- all workspace-scoped via getContext + `agentsRepo.getById(workspaceId,id)`→404 (AC-22); persist installation only when gha+files (AC-11/D-5); structured export logging (NFR-4); NO ingest endpoint (AC-18); runner-bundle-missing → 5xx "runner not built".
Skills: fastify-best-practices, zod, onion-architecture, import-hygiene.
Done when: .it.test.ts — POST valid→200+CiExport; circle→4xx; open_pr→pr_url:null no write; missing repo→422; foreign workspace→404; two exports same repo→1 row; GET /ci/runs over existing/empty rows; missing runner bundle→5xx. Unit+integration green, typecheck green.

---

## Chunk B — client hooks + zip

### Step 2.1 — lib/hooks/ci.ts + barrel
Files: `client/src/lib/hooks/ci.ts` (new), `client/src/lib/hooks/index.ts` (named exports).
- `useAgentCi(agentId)` key `["agent-ci",agentId]`; `useExportCi(agentId)` mutation → invalidate `["agent-ci",agentId]`; `useCiRuns()` key `["ci-runs"]`; Fail CI on change reuses `useUpdateAgent` (./agents), NO new endpoint (D-4); all via `api` (lib/api.ts), never fetch; types via `import type` (barrel gotcha).
Skills: react-best-practices, zod, frontend-architecture, import-hygiene.
Done when: pnpm typecheck green; hooks exported from barrel.

### Step 2.2 — zip util
Files: `client/src/lib/ci-bundle-zip.ts` (new, CiFile[]→Blob via fflate), `client/package.json` (`pnpm add fflate`).
- zip from raw `contents` bytes, no parse/eval of content (NFR-2); pure data transform in lib/ (not utils/); pnpm not npm.
Skills: frontend-architecture, security, import-hygiene.
Done when: unit — CiFile[]→Blob contains all paths; `<script>` in contents stays raw text.

---

## Chunk C — client wizard

### Step 3.1 — Target step + container
Files: `client/src/app/agents/[id]/_components/CITab/ExportWizard/{ExportWizard,TargetStep}.tsx` (+ tests, styles.ts), `client/messages/en/ci.json` (update — DO NOT create new namespace; existing file aligned to old "Open a PR" mockup, realign to zip path).
- wizard selections = ephemeral client `useState` in container (NFR-4), not URL/store; 2×2 grid, GHA default + "recommended" (AC-13); non-GHA disabled "coming soon", Continue only for GHA (AC-14/EC-3); disabled has aria-disabled + explanation (NFR-3); strings via useTranslations.
Skills: react-best-practices, frontend-architecture, react-testing-library, import-hygiene.
Done when: RTL — GHA default; others disabled; Continue only for GHA; tests green.

### Step 3.2 — Preview step
File: `client/src/app/agents/[id]/_components/CITab/ExportWizard/PreviewStep.tsx` (+ test).
- two-pane (FILES / monospace contents) (AC-15); list = server `CiExport.files` (has runner bundle, no memory.jsonl) (AC-16); click file → its contents (AC-17); contents as plain text (JSX escaping, no dangerouslySetInnerHTML) (NFR-2); long system_prompt → panel scrolls (EC-7); 0 skill files → no break (EC-6); preview uses server bundle via useExportCi/preview request (no client YAML gen, N-3).
Skills: react-best-practices, frontend-architecture, react-testing-library, security.
Done when: RTL — list renders exactly server files; click→contents; `<script>` shown as text; long content scrolls.

### Step 3.3 — Configure step
File: `client/src/app/agents/[id]/_components/CITab/ExportWizard/ConfigureStep.tsx` (+ test).
- trigger chips (opened/synchronize/reopened, 2 default) + "Post results as" radio (github_review default/pr_comment/none) (AC-18); trigger change → re-request server preview (debounced) (AC-19/D-C1); all triggers off → Continue disabled + reason (AC-20/EC-5); info callout re Fail CI on as text (AC-21); keyboard-reachable, labeled controls (NFR-3).
Skills: react-best-practices, frontend-architecture, react-testing-library.
Done when: RTL — getByRole finds chips/radio; clear all triggers→Continue disabled+reason; trigger change reflected in preview (mocked request).

### Step 3.4 — Install step + zip delivery
File: `client/src/app/agents/[id]/_components/CITab/ExportWizard/InstallStep.tsx` (+ test).
- two cards — "Open a PR" (disabled/stub, aria-disabled, scope #2) and "Copy files as a zip" (functional) (AC-22/AC-23/EC-4); Install+zip → useExportCi with `{repo,target:'gha',action:'files',post_as,triggers,base}` (AC-2/AC-24), zip via ci-bundle-zip.ts (Blob→download); isPending→button disabled/loading (AC-25); error→error state+retry, wizard stays open (AC-26/EC-8); success→close wizard, CI-tab cache invalidated (AC-27/EC-9).
Skills: react-best-practices, frontend-architecture, react-testing-library, import-hygiene.
Done when: RTL — Install with zip→mutation with action:'files'+download; "Open a PR"→Install disabled; pending→disabled; 5xx→error state, wizard open; success→closed.

---

## Chunk D — client CI tab

### Step 4.1 — CI tab in AgentEditor
Files: `client/src/app/agents/[id]/_components/AgentEditor/AgentEditor.tsx`, `.../AgentEditor/constants.ts` (TABS + `ci`), `client/src/app/agents/[id]/_components/CITab/CITab.tsx` (new, + test, styles.ts).
- tab `ci` next to Config/Skills/Context/Evals, state in `?tab=ci`, `key={agent.id}` (AC-4); `_components/CITab/` folder like siblings; update the "Stats/CI stay out of scope" comment (AgentEditor.tsx:2-3).
Skills: next-best-practices, frontend-architecture, react-testing-library, import-hygiene.
Done when: RTL — `?tab=ci` renders CITab; typecheck green.

### Step 4.2 — CI tab content (pill, Fail CI on, installations, wizard)
Files: `client/src/app/agents/[id]/_components/CITab/CITab.tsx` + subcomponents (`FailCiOnControl.tsx`, `InstallationsList.tsx` as needed, each with test), `client/messages/en/ci.json`.
- "CI deployment" + "Active in N repos" pill (N from useAgentCi, not hardcoded) (AC-5); Fail CI on segmented control = `agent.ci_fail_on`, click→useUpdateAgent (AC-6); row per installation (repo+"GitHub Actions" badge+status pill+time) + "+ Add repository" (AC-7); status/severity distinguished by TEXT not only color (NFR-3); "Add to CI"/"+ Add repository"→wizard step 1 (AC-8); "Update CI config"→regenerate from defaults, zip, no pre-fill (AC-9/D-C2); loading→skeleton (AC-10); empty→CTA "+ Add to CI", "Active in 0 repos"/hidden (AC-11/EC-1); installation without run→neutral status (AC-12/EC-2); test mocks `@/lib/hooks/ci` directly via vi.hoisted (client/INSIGHTS).
Skills: react-best-practices, frontend-architecture, react-testing-library.
Done when: RTL — N=len(installations); empty state with CTA; loading→skeleton; neutral status without run; Fail-CI segment click→mutation; "Add to CI" opens wizard; repeat export doesn't dup row.

---

## Chunk E — client CI Runs

### Step 5.1 — nav GLOBAL + CI Runs route
Files: `client/src/vendor/ui/nav.ts` (GLOBAL group with "CI Runs" below "Agent Performance"), `client/src/app/ci-runs/page.tsx` (new, thin).
- "CI Runs" item in GLOBAL group (create group if absent — A-3); nav key `ci-runs` already mapped (helpers.ts:38); page.tsx thin — just renders view (AC-28/AC-31).
Skills: next-best-practices, frontend-architecture, import-hygiene.
Done when: item present in nav.ts; page.tsx renders CiRunsView; typecheck green.

### Step 5.2 — CI Runs view
Files: `client/src/app/ci-runs/_components/CiRunsView/{CiRunsView.tsx,test,styles.ts, columns.ts?}`, `client/messages/en/ci.json`.
- one GET via useCiRuns on mount, no polling (NFR-1); row per run with columns (repo·agent·event·status·severity-vs-threshold·time·link — OQ-1 default) (AC-29); status by text not only color (NFR-3); empty state (not spinner/error) (AC-30); `ci_installation_id=null`→row without active repo link (EC-10); no prId/details→link inactive not "dead" (EC-11, OQ-3 — link inactive pending confirmation); page test mocks app-shell pass-through + `@/lib/hooks/ci` (client/INSIGHTS).
Skills: react-best-practices, frontend-architecture, react-testing-library, import-hygiene.
Done when: RTL — rows with columns+link; empty state; null-installation no link; inactive link without details; pnpm test green.

## Verification commands
- server (pnpm, from server/): `pnpm typecheck` · unit `pnpm exec vitest run --exclude '**/*.it.test.ts'` · integration `pnpm exec vitest run .it.test`
- client (pnpm, from client/): `pnpm typecheck` · `pnpm test`
- Node/pnpm via WebStorm bundle (root CLAUDE.md "No system Node"). No lint scripts exist.

## Non-blocking open questions (defaults applied)
- OQ-1: CI Runs column set — SUPERSEDED by addendum below (explicit columns now required).
- OQ-3: run "detail" link target — job link (GitHub Actions) per addendum.

---

# ADDENDUM v2 — expanded requirements ("worktree B")

> Added after the user supplied fuller requirements that REVERSE three earlier
> locked decisions and expand scope. This addendum is now the source of truth for
> the affected areas; plan-verifier(full) checks against it. Chunks A–E above stay,
> revised where noted. Budget raised: ~8–9 implementer passes total (user chose
> "quick addendum", not spec rewrite).

## Confirmed decisions (v2)
1. **Install "Open a PR" is now REAL** (reverses "disabled stub"): wizard creates a
   branch `devdigest/ci` and opens a PR with the generated files — never writes to
   `main`. Zip download stays as the second option.
2. **Ingest is now IN SCOPE** (reverses "out of scope"): an **authenticated** endpoint
   ingests `devdigest-result.json` and **writes BOTH** — canonical `agent_runs`
   (`source='ci'`) AND a linked `ci_runs` projection. CI Runs page + CI-tab pills read
   `ci_runs` (Chunk A read-model kept).
3. **`.devdigest/memory.jsonl` is BACK** in the bundle + Preview (reverses exclusion).
4. **CI tab** additionally shows **workflow version** and **run history**.
5. **CI Runs columns** (explicit): repo · PR · agent · verdict · findings · cost ·
   duration · job link (GitHub Actions).
6. **Workflow security hardening** (all required):
   - `permissions:` least-privilege — `contents: read` always; `pull-requests: write`
     ONLY when `post_as !== 'none'` (everything else defaults to `none`).
   - External actions pinned to full commit SHA (with a `# vX` comment), not tags.
   - Keep `pull_request` (NEVER `pull_request_target` + checkout of untrusted PR code).
     Fork-PR: secrets unavailable / token read-only — workflow must degrade cleanly.
   - `OPENROUTER_API_KEY` only as `${{ secrets.* }}`; never in manifest/artifact/log/trace.
7. **A migration IS now needed** (reverses "no migration") — via `pnpm db:generate`
   only, never hand-edit. New fields (consolidate into one migration): per-installation
   ingest token (store a HASH, not the plaintext), `workflow_version`, `pr_url`, and a
   `duration_ms` on the `ci_runs` projection (and `verdict` if `status` is insufficient).
   Confirm exact columns against existing schema before generating.

## Ingest auth contract (DEFAULT — flag; change if you disagree)
- Per-installation **Bearer token**: generated at export, shown once so the user adds
  it to the target repo as secret `DEVDIGEST_INGEST_TOKEN`; server stores only its hash.
- Generated workflow posts the artifact after the runner step:
  `POST ${DEVDIGEST_INGEST_URL}/ci/ingest` with `Authorization: Bearer ${{ secrets.DEVDIGEST_INGEST_TOKEN }}`,
  body = `devdigest-result.json`, plus `github.sha` (commit) and `github.repository` (repo id).
- Ingest validates: bearer token → installation; zod-schema of the artifact; commit SHA
  present; repository id matches the installation. Reject otherwise. No secret ever logged.
- Engine boundary preserved: the POST is a step in OUR generated workflow, NOT a change to
  `agent-runner/`.

## Workflow version (DEFAULT — flag)
- A `WORKFLOW_VERSION` constant embedded in the generated workflow (comment/field) and
  stored on the installation at export; CI tab renders it. Bumped when generation changes.

---

## Addendum passes (dependency order; total run ~8–9 with A/B/C)

### Pass 4 (server) — REVISE Chunk A: migration + workflow hardening + memory + ingest step
Files: `server/src/db/schema/ci.ts` (+ new columns), migration via `pnpm db:generate`,
`server/src/modules/ci/{workflow,bundle,constants}.ts`, memory sourcing helper.
- Add `permissions` block (decision 6); SHA-pin `actions/checkout`/`actions/setup-node`;
  add the ingest POST step (auth contract above); keep `pull_request` + fork-degrade note.
- Re-include `.devdigest/memory.jsonl` in `buildBundleFiles` — source the agent's memory
  as JSONL (find the memory read model; if none, define the minimal export). Flag if memory
  source is ambiguous.
- Run `pnpm db:generate` for the consolidated new columns (decision 7).
Done when: workflow YAML has least-privilege permissions + SHA-pinned actions + ingest step;
bundle includes memory.jsonl; migration generated (not hand-edited); server unit+it green.

### Pass 5 (server) — PR creation (branch `devdigest/ci` + PR) + side-effect-free preview
Files: `server/src/adapters/github/*` (write method behind a DI port), `server/src/modules/ci/{service,routes}.ts`.
- On `action:'open_pr'`: create/reset branch `devdigest/ci` off the default branch, commit
  the generated `CiFile[]`, open a PR "Add DevDigest CI review"; return `pr_url`; persist
  installation with `pr_url`. Uses existing GitHub token (write) via the secrets provider —
  never echo the token. Reuse any existing GitHub client/adapter; add only the write path.
- Least-privilege: only `contents`+`pull_requests` scopes exercised.
- **CRITICAL — add a side-effect-free `action:'preview'`** (or a dedicated GET preview route):
  builds + returns the `CiExport` bundle with NO GitHub write and NO persistence. Reason:
  `action:'open_pr'` now HAS side effects (creates a PR), but Chunk C wired the wizard's
  debounced Preview (fires ~every 400ms) to `action:'open_pr'`. Left as-is, Preview would
  spam real PRs. Pass 7 must switch the client Preview to this new preview action. Keep the
  contract shape identical to today's preview response so Pass 7 is a one-line action swap.
Done when: `.it.test.ts` (GitHub client stubbed via DI) — `open_pr` creates branch+PR, returns
`pr_url`, persists installation; `action:'preview'` returns the bundle and makes ZERO GitHub
calls + ZERO DB writes; failure surfaces a clean error, no token leak.

### Pass 6 (server) — authenticated ingest + dual-write
Files: `server/src/modules/ci/{routes,service,repository}.ts` (ingest path), auth guard.
- `POST /ci/ingest`: bearer-token auth → installation; zod-validate artifact; check commit
  SHA + repo id; then dual-write `agent_runs` (`source='ci'`, resolve `prId` from repo+PR#,
  `agentId` from installation) AND a `ci_runs` projection (pr_number, status/verdict,
  findings_count, cost_usd, github_url=job link, ran_at, duration_ms, source='ci').
- No secrets logged; reject on any validation failure with a typed error (401/422).
- This is the ONLY writer of `ci_runs`/`agent_runs(source=ci)` — the export path still never
  writes runs.
Done when: `.it.test.ts` — valid signed ingest writes one `agent_runs` + one `ci_runs`, linked;
bad token→401; bad schema/SHA/repo→422; nothing written on reject; no secret in logs.

### Pass 7 (client) — REVISE Chunk C: Preview memory + Install real PR
Files: `.../CITab/ExportWizard/{PreviewStep,InstallStep}.tsx` (+ tests).
- Preview now lists `.devdigest/memory.jsonl` (auto, since server bundle includes it).
- **Switch Preview's request from `action:'open_pr'` to the new `action:'preview'`** (Pass 5)
  so debounced preview never creates a PR. This is the load-bearing fix.
- Install "Open a PR" becomes FUNCTIONAL: calls `useExportCi` with `action:'open_pr'` →
  shows resulting `pr_url` (link) on success; zip path unchanged. Both cards enabled.
Done when: RTL — Preview shows memory.jsonl; "Open a PR"→mutation with `action:'open_pr'`,
success renders PR link; zip still works; errors keep wizard open.

### Pass 8 (client) — Chunk D CI tab (+ workflow version + history)
Files: `.../CITab/CITab.tsx` + subcomponents (+ tests).
- Base Chunk D (pill, Fail CI on, installations list, wizard mount) PLUS: workflow version
  per installation, and per-installation run history (list from `ci_runs`).
Done when: RTL — version rendered; history list from mocked `useAgentCi`/runs; base AC-5..12 hold.

### Pass 9 (client) — Chunk E CI Runs (expanded columns)
Files: `client/src/app/ci-runs/_components/CiRunsView/*` (+ test), `nav.ts`, `app/ci-runs/page.tsx`.
- Columns: repo · PR · agent · verdict · findings · cost · duration · job link (GitHub Actions).
- Empty state correct; `ci_installation_id=null` tolerated; job link → GitHub Actions run URL.
Done when: RTL — all columns render from mocked `useCiRuns`; empty state; job link active when present.

## Review/verify (v2)
- architecture-reviewer: after Pass 6 (all new server: PR-write adapter behind DI, ingest
  auth, onion purity, no engine edits, secrets never in code) and after Pass 9 (whole client).
- **security review** (the `security` skill / security-review) on the generated workflow +
  ingest endpoint specifically — least-privilege permissions, fork-PR handling, token/secret
  handling, ingest auth + input validation. This is new and load-bearing.
- plan-verifier: structural after the server passes (4–6) and after client (7–9); full at the end,
  checking against THIS addendum (specs SPEC-05/06 still encode v1 and are NOT the check target
  for the reversed items).
