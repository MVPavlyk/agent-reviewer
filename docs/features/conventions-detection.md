# Conventions Detection

**Status:** done — 2026-08-05
**Packages:** server, client

## What

Auto-detects a connected repo's real coding conventions and lets the user
turn accepted ones into a Skill, closing the loop from "repo behavior" to
"reviewer instruction" without hand-authoring:

- **Conventions page** (`/conventions`, top-level nav item under "SKILLS LAB")
  — heading + "Detected from N sample files · last scan Xh ago" subtitle, a
  "Re-scan" button, an "N of Y accepted" bar, and a "Create skill" button
  ([ConventionsListView.tsx](../../client/src/app/conventions/_components/ConventionsListView/ConventionsListView.tsx))
- **Convention card** — title, confidence bar (same 85%/65% ok/warn/muted
  thresholds as `ConfidenceNum`), `file:line` evidence with a copyable code
  snippet, and Accept/Reject buttons. The Accept button turns solid blue
  (`kind="primary"`) once accepted — that color swap is the *only* "selected"
  signal, there is no separate checkbox
  ([ConventionCard.tsx](../../client/src/app/conventions/_components/ConventionCard/ConventionCard.tsx))
- **Create skill from conventions modal** — merges every currently-accepted
  convention into one editable skill draft (Name/Description/Type/Body, a
  filename-tabbed markdown editor with a live token estimate) and saves it as
  a real skill
  ([CreateSkillFromConventionsModal.tsx](../../client/src/app/conventions/_components/CreateSkillFromConventionsModal/CreateSkillFromConventionsModal.tsx),
  [MergedBodyEditor.tsx](../../client/src/app/conventions/_components/MergedBodyEditor/MergedBodyEditor.tsx))
- **API surface**
  (`([conventions/routes.ts](../../server/src/modules/conventions/routes.ts))`):
  `GET /repos/:id/conventions`, `POST /repos/:id/conventions/rescan` (202,
  enqueues a job), `POST /repos/:id/conventions/reset-accepted` ("Deselect
  all"), `POST /conventions/:id/accept|reject`, `POST
  /conventions/skill-draft` (stateless merge preview), `POST
  /conventions/create-skill`.

## Why

Skills Lab already let users hand-author or import rubrics/conventions for
reviewer agents, but the user had to notice their own house rules and write
them up themselves. This feature detects conventions actually followed in a
repo (repo-intel candidate files + an LLM read) and surfaces them as
reviewable, evidence-backed suggestions the user can merge into a skill with
one click. It also finishes scaffolding that was already sitting unused since
Skills Lab shipped: a dead `conventions` DB table, a `conventions.json` i18n
file, a `ConventionCandidate` contract, and `activeKeyFor`'s `/conventions`
nav mapping — all written ahead of time and never wired up.

## How

- **Detection is manual-only.** A "Re-scan" click enqueues a job on the
  existing `JobRunner`; nothing triggers detection from a PR review run. This
  was an explicit product decision to keep v1 predictable and cheap, not an
  oversight.
- **Schema reused, not rebuilt.** `server/src/db/schema/knowledge.ts`'s
  `conventions` table already existed (migrated, zero real usages) and was
  extended in place — `status` enum (`pending`/`accepted`/`rejected`)
  replacing a plain `accepted: boolean`, plus `title`/`startLine`/`endLine`/
  `scanId`/`decidedAt`. A new `conventionScans` table owns per-scan metadata
  (`sampleFileCount`, `candidateCount`, `status`) so the page subtitle doesn't
  need a second round trip. Migration `0014_slippery_morgan_stark.sql`.
- **Detection pipeline**
  ([service.ts](../../server/src/modules/conventions/service.ts)):
  `repo-intel.getConventionSamples()` picks candidate files by rank;
  a new `repo-intel.getFileContents()`
  ([repo-intel/service.ts](../../server/src/modules/repo-intel/service.ts))
  reads their content from the clone; `container.llm('openrouter')` (hardcoded
  provider/model — no per-repo/workspace config exists yet) returns structured
  suggestions via `completeStructured`, validated against the sampled-paths
  set so a hallucinated file path never gets persisted.
- **Rescan semantics: wipe-pending, never touch decided rows.** A rescan
  deletes only `status='pending'` rows and re-inserts fresh candidates.
  Accepted/rejected rows persist across rescans and are fed back into the LLM
  prompt as an "already decided — do not re-suggest" digest, since matching by
  identity across differently-worded LLM output isn't reliable.
- **"Selected for merge" IS "accepted" — no separate selection state.** An
  earlier iteration added a per-card `Checkbox` for a distinct
  "included-in-merge" concept; user feedback made clear the reference design
  has no such control, and the shared `Button` primitive's `active` prop only
  changes color for `kind="tertiary"` anyway (a `kind="secondary"` Accept
  button with `active={accepted}` was silently a no-op). Both were replaced:
  the Accept button's `kind` now swaps to `"primary"` when accepted, and
  "Create skill" always merges every currently-accepted convention.
- **"Deselect all" is a real bulk mutation, not a local toggle.**
  `POST /repos/:id/conventions/reset-accepted`
  ([repository.ts](../../server/src/modules/conventions/repository.ts)`.resetAcceptedByRepo`)
  reverts every `accepted` row in a repo back to `pending` server-side.
  Deliberately distinct from `reject`, which permanently excludes a
  convention from future re-suggestion — a reset just un-decides it.
- **Merge-to-skill is a stateless preview + explicit save**, mirroring
  `POST /skills/import/preview`: `buildSkillDraftFromConventions`
  ([draft.ts](../../server/src/modules/conventions/draft.ts)) is a pure
  function (one `##` section per convention, each citing its `file:line`)
  modeled directly on `extractSkill`'s `SkillDraft` shape. `create-skill`
  saves through the existing `container.skillsRepo` with `source: 'extracted'`
  — no new skill-creation logic.
- **`conventions.id` is a required ORDER BY tiebreaker.** Every row from one
  scan is inserted in a single batch and can share the exact same `createdAt`
  (Postgres `now()` is fixed per statement); without `asc(id)` alongside
  `desc(createdAt)`, the list visibly reshuffled between refetches (e.g.
  after every accept/reject).
- **React Query + StrictMode gotcha.** The merge-preview fetch fires from a
  mount effect and deliberately uses `mutateAsync(...).then(setState)`
  instead of watching the mutation hook's own `.data`/`.isPending` — under
  React StrictMode's double-invoked mount effects, the latter never
  re-rendered the component when the mutation resolved. See
  `client/INSIGHTS.md` and
  [CreateSkillFromConventionsModal.tsx:58](../../client/src/app/conventions/_components/CreateSkillFromConventionsModal/CreateSkillFromConventionsModal.tsx).

## Known gaps

- No per-repo or per-workspace LLM provider/model setting — detection always
  uses a hardcoded `openrouter` + `deepseek/deepseek-v4-flash` constant (the
  same default `db/seed.ts` uses for built-in agents).
- A rescan discards any still-`pending` suggestions from the previous scan,
  even ones the user was about to accept — there's no way to preserve them
  across a rescan short of accepting/rejecting first.
