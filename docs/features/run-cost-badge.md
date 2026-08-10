# Run Cost Badge

**Status:** done — 2026-08-01
**Packages:** server, client

## What

Shows the USD cost of a review run in three places:

- **PR list** — `COST` column, `SUM(cost_usd)` across all of a PR's runs
  ([PRRow.tsx](../../client/src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.tsx))
- **PR Detail → Agent runs timeline** — per-run `9 119 tok · $0.0013`
  ([RunHistory.tsx](../../client/src/app/repos/[repoId]/pulls/[number]/_components/RunHistory/RunHistory.tsx))
- **PR Detail → Review runs accordion header** — compact `$0.001` next to the
  score badge
  ([ReviewRunAccordion.tsx](../../client/src/app/repos/[repoId]/pulls/[number]/_components/ReviewRunAccordion/ReviewRunAccordion.tsx))
- **Run Trace drawer → Stats** — `COST` stat alongside DURATION/TOKENS/FINDINGS
  ([TraceBody.tsx](../../client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/_components/TraceBody/TraceBody.tsx))

An unknown cost always renders `—`, never `$0.00` — see
[`client/src/components/run-cost-badge/format.ts`](../../client/src/components/run-cost-badge/format.ts).

## Why

The dollar cost of a review run existed once (`agent_runs.cost_usd`) and was
deliberately removed (`d45ab0d`, `58c6ac7`) to be rebuilt from scratch as a
course lab (L01) exercising: schema migrations, shared-contract drift between
`server/` and `client/` vendor copies, and null-vs-zero UI semantics.

## How

- **Source of the number:** OpenRouter returns real spend as `usage.cost` on
  the completion response; `reviewer-core` surfaces it as
  `ReviewOutcome.costUsd`. Zero extra model calls. Providers that don't report
  a price fall back to `PriceBook.estimate()` (server/src/platform/price-book.ts),
  synchronous and cached.
- **Persistence:** `agent_runs.cost_usd` (migration `0010_brown_wiccan.sql`),
  nullable — `null` means "unknown", never coerced to `0`. Failed/cancelled
  runs and pre-work failures always persist `null`.
- **List aggregate:** one grouped `SUM(...) GROUP BY pr_id` query in
  `server/src/modules/pulls/routes.ts` (`costByPr`), Postgres SUM skips NULLs.
- **Contracts:** `cost_usd` added to `RunSummary` and `RunStats`
  (`contracts/trace.ts`) and `PrMeta` (`contracts/platform.ts`) — hand-mirrored
  in both `server/src/vendor/shared` and `client/src/vendor/shared` (no sync
  script between them).

## Known gap

`run_traces.trace` is an immutable jsonb snapshot written once per run and
never re-derived (`getRunTrace` does a raw `as RunTrace` cast, no schema
migration on read). Runs completed after `agent_runs.cost_usd` was added but
before `RunStats.cost_usd` was added to the trace shape have a trace document
that's missing the key — the drawer shows `—` for those, permanently, while
the PR list / timeline (which read `agent_runs` directly) show the real price.
Accepted as-is; no backfill planned.

## Out of scope (not built)

- Per-run cost on the verdict plaque (`VerdictBanner`) — the design mockup
  showed it, but wasn't requested.

Note: `ReviewRunAccordion` has no `cost_usd` of its own — `ReviewRecord`
doesn't carry it. `FindingsTab` builds a `run_id → cost_usd` lookup from
`prRuns` (the same `RunSummary[]` the timeline reads) and passes it down.
