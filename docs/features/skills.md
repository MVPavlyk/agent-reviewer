# Skills

**Status:** done — 2026-08-03 (base), 2026-08-04 (Stats + Versions extension)
**Packages:** server, client

## What

- **`/skills` page** — a grid of skills + a two-pane detail view, tabbed
  Config / Preview / Stats / Versions
  ([SkillDetailTabs.tsx](../../client/src/app/skills/_components/SkillDetailTabs/SkillDetailTabs.tsx)).
  Selection lives in `?skill=`, the active tab in `?tab=` — both URL-owned.
- **Config tab** — name/description/type badges, an editable Markdown body,
  and an enable toggle
  ([ConfigTab.tsx](../../client/src/app/skills/_components/SkillDetailTabs/_components/ConfigTab/ConfigTab.tsx)).
- **Preview tab** — the body rendered as Markdown, the way it actually reads
  once assembled into a prompt
  ([PreviewTab.tsx](../../client/src/app/skills/_components/SkillDetailTabs/_components/PreviewTab/PreviewTab.tsx)).
- **Stats tab** — agents-count / pull-rate / accept-rate tiles, a
  findings-by-category cost breakdown for the last 30 days, and an explicit
  "attribution is approximate" caveat
  ([StatsTab.tsx](../../client/src/app/skills/_components/SkillDetailTabs/_components/StatsTab/StatsTab.tsx)).
- **Versions tab** — every body snapshot newest-first, a user-entered change
  summary per version, a line diff against the current body, and Restore
  ([VersionsTab.tsx](../../client/src/app/skills/_components/SkillDetailTabs/_components/VersionsTab/VersionsTab.tsx)).
- **Import** — create from scratch or upload a `.md`/`.zip`; the preview shows
  the extracted draft plus any ignored archive entries (e.g. a decoy
  `install.sh`) before the user confirms
  ([AddSkillDrawer.tsx](../../client/src/app/skills/_components/AddSkillDrawer/AddSkillDrawer.tsx)).
- **Skills tab in the agent editor** — attach/detach and reorder linked
  skills, no drag-and-drop library
  ([SkillsTab.tsx](../../client/src/app/agents/[id]/_components/AgentEditor/_components/SkillsTab/SkillsTab.tsx)).
- **`SkillCard` stat line** — `N agents · P% pull · A% accept` under each
  card's badges, read straight off the list response (no per-card fetch)
  ([SkillCard.tsx](../../client/src/app/skills/_components/SkillCard/SkillCard.tsx)).
- **Run Trace drawer** — a distinct `Skills` prompt block with a `~N tokens`
  estimate when an enabled skill reached the prompt, absent otherwise
  ([PromptBlock.tsx](../../client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/_components/PromptBlock/PromptBlock.tsx)).
- **API** — `server/src/modules/skills/routes.ts`: CRUD (`GET/POST/PUT/DELETE
  /skills`), `POST /skills/import/preview`, `GET /skills/:id/versions`,
  `POST /skills/:id/versions/:version/restore`, `GET /skills/:id/stats`.

## Why

Agents were already configurable (model, system prompt, strategy), but the
only way to change an agent's review behaviour was to rewrite its whole system
prompt — there was no way to lift a single criterion into a named, reusable
block and share it across agents, or to see whether attaching one actually
changed anything. The base feature closed that gap end-to-end (create/import
→ attach → reaches the prompt, proven by a control experiment comparing a run
with skills on vs. off). The Stats/Versions extension followed once the base
UI shipped, to answer the next obvious question — "is this skill worth
keeping, and what changed between versions" — which the original spec's
design mockups called for but explicitly deferred.

## How

- **`skills.enabled = false` excludes a skill from every run, even when the
  agent link remains** — the resolver checks both the link and the skill's
  own flag. This is a pure function, `selectSkillBodies()`
  ([prompt-blocks.ts](../../server/src/modules/skills/prompt-blocks.ts)), so
  it's independently unit-tested from the Fastify/Drizzle plumbing around it.
- **No `wrapUntrusted`** — an imported skill enters the prompt as an
  instruction like any other, regardless of `source`. This is a stated,
  accepted risk (a hostile skill can skew findings); the only defence is a
  human reading the import preview before saving. `sanitize()` still escapes
  a literal `</untrusted>` inside a skill body — that protects the
  *neighbouring* diff block from an early-closed fence, it isn't a trust
  mechanism.
- **Import is base64-over-JSON, not multipart** — the rest of the client has
  no multipart transport, so this avoids adding a second one for one route.
  `.zip` decompression runs through `fflate` (pure TS, zero dependencies,
  never touches disk); the adapter filters entries by extension/size/path
  *before* inflating, so a zip bomb or `install.sh` is provably never
  decompressed, not just discarded after the fact
  ([fflate.ts](../../server/src/adapters/archive/fflate.ts)).
- **`container.skillsRepo` was deliberately NOT added in the base feature** —
  no module besides `modules/skills` needed it. The Stats extension gave it a
  second real consumer: `ReviewRunExecutor` persists `run_skills` (which
  skills, and which skill *version*, reached a given run) right after it
  resolves `linkedSkills`, so the getter was added at that point, mirroring
  `agentsRepo`
  ([container.ts:111](../../server/src/platform/container.ts),
  [run-executor.ts:208](../../server/src/modules/reviews/run-executor.ts)).
- **Usage stats (`agents_count`/`pull_rate`/`accept_rate`) are batched
  IN-queries merged in JS, not one giant join** — same shape as
  `costByPr`/`latestReviewScoreByPr` elsewhere in `modules/pulls`, and
  computed for the whole `GET /skills` list in one pass rather than per-card.
  `pull_rate` floors the eligible-run window at `skills.created_at`, so a
  freshly-linked skill isn't penalized by an agent's run history from before
  the skill existed. Both stats are still approximate: `agent_skills` carries
  no link-history, so "eligible runs" is evaluated against *today's* links,
  not whatever was linked at each historical run's own time
  ([repository.ts](../../server/src/modules/skills/repository.ts)).
- **Findings-by-category cost split is a pure function, not a SQL
  aggregate** — `apportionCostByCategory()` takes one row per attributed
  finding (its category, its run's cost, its run's finding count) and does
  the even-split-then-group math in JS, so it's unit-tested without a
  database
  ([stats.ts](../../server/src/modules/skills/stats.ts)).
- **Restore is copy-forward, never a rewrite** — "restore v4" when current is
  v5 creates v6 with v4's body, by reusing the existing update()
  bump-and-snapshot path unchanged. History is never lost; a
  user-entered `change_summary` (free text, no LLM auto-summarization) is
  optional and only recorded when a body edit actually happens.
- **The Versions diff is a small local LCS line-diff, not the `diff` npm
  package** — the existing `diff-viewer/` component is GitHub-unified-diff
  specific (`PrFile.patch`) and doesn't fit two arbitrary markdown bodies
  ([diff.ts](../../client/src/app/skills/_components/SkillDetailTabs/_components/VersionsTab/diff.ts)).

## Known gaps

- `agents_count`/`pull_rate`/`accept_rate` and the Stats cost breakdown are
  all approximations, surfaced honestly in the UI rather than fixed: findings
  are never LLM-tagged to a specific skill (a run's cost/findings are
  attributed to *every* skill active on that run), and `pull_rate`'s
  denominator is bounded by `skills.created_at`, not the skill's actual link
  date (which isn't tracked).
- The e2e flow (`e2e/specs/08-skills.flow.json`) was written but never run
  live in this environment (no `agent-browser` CLI / running dev stack).
- The manual UI walkthrough was not performed — `client/CLAUDE.md` forbids
  driving the app with a browser tool to "verify" a change; only automated
  tests (`pnpm test`, `pnpm typecheck`) were run for both the base feature and
  the extension.

## Out of scope (not built)

- Import from URL and the community skill catalog — unused i18n keys
  (`url.*`, `community.*`) are left in place for a future iteration.
- A `/skills/:id` detail route — the tabbed side panel via `?skill=&tab=`
  covers it.
- `.tar.gz` archives — `.zip` only.
- An Evals tab — no eval-running infrastructure exists for skills yet.
- Precise (non-approximate) finding→skill attribution — would need an LLM
  prompt/schema change.
- A date-range picker for Stats — fixed 30-day window.
