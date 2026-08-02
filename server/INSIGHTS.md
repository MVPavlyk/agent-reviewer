# INSIGHTS — @devdigest/api

Append-only running notes for this package — what the code and CLAUDE.md don't
already say. Written by the `engineering-insights` skill, read before
non-obvious work here. Conventions live in CLAUDE.md; this file holds what
someone learned the hard way.

Entry format (one line, dated, anchored to a file, a command, or an exact error):

    - **YYYY-MM-DD** — claim, with what to do — `path/file.ts:42`

## What Works
- **2026-08-01** — Run cost needs ZERO extra model calls: OpenRouter returns `usage.cost` in the same response, surfaced as `ReviewOutcome.costUsd`; use `container.priceBook.estimate()` (synchronous, cached) only as the fallback for providers that report no price — `server/src/modules/reviews/run-executor.ts:218`

## What Doesn't Work

## Codebase Patterns
- **2026-08-01** — Adding a field to `PrMeta` also changes `GET /pulls/:id`, because `PrDetail = PrMeta.extend({...})`. Declare list-only aggregates with `.nullish()` (as `score` does) and both detail branches keep compiling untouched; a plain `.nullable()` would force you to fill the GitHub-refresh AND offline-fallback literals — `server/src/vendor/shared/contracts/platform.ts:172`
- **2026-08-01** — `enqueue()` returns `done`, which REJECTS on failure, but every call site keeps only `job.id` — that floating rejection used to kill the API process via Node's default `unhandledRejection`. A no-op `done.catch()` now marks it observed; if you add a new job kind, the failure is still readable from the `jobs` row (status/error), not from `done` — `server/src/platform/jobs.ts:108`
- **2026-08-01** — RunStats.cost_usd (Run Trace drawer COST stat) was intentionally excluded in the first cost pass — added later. Adding a required field to RunStats/RunTrace breaks any `.parse()` call in tests that hand-builds the object, e.g. `server/test/contracts.test.ts:160` — both vendor copies AND every test fixture need the field, not just the schema.

## Tool & Library Notes
- **2026-08-01** — drizzle types `sum()` as `SQL<string | null>` (numeric semantics) even over a `doublePrecision` column, where pg actually returns a JS number — coerce with `Number()` and guard `Number.isFinite` rather than trusting either type — `server/src/modules/pulls/routes.ts:345`

## Recurring Errors & Fixes
- **2026-08-01** — `PostgresError: deadlock detected` (40P01) on `relation "references"` = two repo-intel index jobs running for the SAME repo at once; `JobRunner` concurrency is 3 and nothing serializes them, and both DELETE-then-INSERT the repo's reference rows — `server/src/modules/repo-intel/repository.ts:262`

## Decisions
- **2026-08-01** — `agent_runs.cost_usd` is nullable and MUST stay null (never 0) on failed/cancelled/pre-work-failure runs: the UI reads null as "unknown" (dash) and 0 as "free" — `server/src/modules/reviews/run-executor.ts:82`

## Session Notes
- **2026-08-01** — Run Cost Badge (L01): re-added `agent_runs.cost_usd`, SUM-per-PR on the list endpoint, `RunCostBadge` in the COST column + timeline. Migration was NOT generated — node/pnpm are absent from this machine, so `pnpm db:generate` + `pnpm db:migrate` still have to be run before the feature works.
- **2026-08-01** — Correction to the Run Cost Badge note above: Node 22 was installed to `~/.local/node` (PATH exported from `~/.zprofile`), so migration `0010_brown_wiccan.sql` WAS generated and applied; server unit 101/101, integration 28/28, client 34/34, reviewer-core 23/23 all pass.

## Open Questions
