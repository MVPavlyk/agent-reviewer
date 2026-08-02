# INSIGHTS — @devdigest/web

Append-only running notes for this package — what the code and CLAUDE.md don't
already say. Written by the `engineering-insights` skill, read before
non-obvious work here. Conventions live in CLAUDE.md; this file holds what
someone learned the hard way.

Entry format (one line, dated, anchored to a file, a command, or an exact error):

    - **YYYY-MM-DD** — claim, with what to do — `path/file.ts:42`

## What Works
- **2026-08-01** — Review costs are fractions of a cent, so `toFixed(2)` collapses every run to "$0.01". Format below $1 with 3 significant digits and trim the padding; reserve plain cents for >= $1. Unknown cost renders "—", never "$0.00" — `client/src/components/run-cost-badge/format.ts:26`

## What Doesn't Work

## Codebase Patterns
- **2026-08-01** — The PR list is a CSS-grid fake table: a new column means editing `GRID`, `COLUMN_KEYS` and the row cells together. Insert before `updated`, since `page.tsx` right-aligns only `COLUMN_KEYS[length-1]` — `client/src/app/repos/[repoId]/pulls/constants.ts:27`

## Tool & Library Notes

## Recurring Errors & Fixes
- **2026-08-01** — Rendering a component that pulls a NEW i18n namespace breaks existing tests silently-late: `NextIntlClientProvider` in a test only carries the namespaces it is handed. Adding `RunCostBadge` (namespace `common`) to `RunHistory` required `messages={{ prReview: messages, common }}` — `client/src/app/repos/[repoId]/pulls/[number]/_components/RunHistory/RunHistory.test.tsx:39`

## Decisions

## Session Notes

## Open Questions
