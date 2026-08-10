# Findings by Severity

**Status:** done — 2026-08-02
**Packages:** server, client

## What

Severity counters (`CRITICAL` / `WARNING` / `SUGGESTION`) for a PR's findings,
clickable to filter — plus a hover preview of the findings behind each count:

- **PR list** — `FINDINGS` column, icon+count per non-zero severity, `—` when
  a PR has no findings
  ([PRRow.tsx](../../client/src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.tsx))
- **PR Detail → Agent runs → counter row** — all three levels above the
  "Review runs" section; clicking one narrows the accordions below to runs
  with a finding at that level (URL: `?sev=CRITICAL`, toggles off on a repeat
  click)
  ([FindingsTab.tsx](../../client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsTab/FindingsTab.tsx))
- **PR Detail → Agent runs → Timeline** — per-run severity icons in place of
  the old `"N findings · M blockers"` text
  ([RunHistory.tsx](../../client/src/app/repos/[repoId]/pulls/[number]/_components/RunHistory/RunHistory.tsx))
- **Hover popover** — hovering any severity-icon cluster (PR list row or
  Timeline run) previews that scope's findings (title, filename:line,
  confidence); clicking one navigates to
  `/repos/:id/pulls/:number?tab=findings&sev=<severity>&findingItem=<id>`,
  which opens/scrolls to that exact finding card
  ([findings-preview/](../../client/src/components/findings-preview/))
- **Click a severity badge itself** (not a popover item) jumps straight to
  that severity: `router.push` to the filtered PR from the list, or the same
  in-page `?sev=` filter from the Timeline
  ([SeverityCounts.tsx](../../client/src/components/severity-counts/SeverityCounts.tsx))

Dismissed findings (`dismissed_at != null`) are excluded from every count,
consistently on both server and client.

## Why

The PR list showed a score ring but no way to tell "is there anything
critical here?" without opening every run's accordion. Same small-lab shape as
[run-cost-badge](./run-cost-badge.md): contract → server aggregate → shared
client component → list column + detail usage → tests.

## How

- **Contracts:** `SeverityCounts` (`{critical, warning, suggestion}`) and
  `PrMeta.findings: SeverityCounts.nullish()` in `contracts/platform.ts` —
  hand-mirrored in `server/src/vendor/shared` and `client/src/vendor/shared`,
  same `.nullish()` reasoning as `cost_usd` (`PrDetail extends PrMeta`).
- **List aggregate:** `findingsByPr()` in `server/src/modules/pulls/routes.ts`
  — one `inArray` join `findings → reviews`, filtered to
  `kind: 'review'` + `dismissed_at IS NULL`, grouped in JS, tallied by
  `rollupSeverities()` (`server/src/modules/pulls/status.ts` — existed since
  the cost feature but was dead code until this one revived it).
- **Index:** `findings.review_id` had no index at all; added one
  (migration `0011_dark_fat_cobra.sql`) since the join now runs on every list
  load.
- **PR-detail counts:** computed client-side from the already-fetched
  `ReviewRecord[]` via `countBySeverity()`
  (`client/src/components/severity-counts/helpers.ts`) — deliberately
  duplicates the server's exclude-dismissed rule so the two numbers agree by
  construction without an extra request.
- **Filter state:** single URL param `?sev=<level>`, read/written the same way
  the page already handles `?tab`/`?trace` (hand-rolled `useSearchParams` +
  `router.replace`, no nuqs in this repo).
- **Popover:** `vendor/ui/primitives/Popover.tsx` — no positioning library;
  renders through `createPortal(document.body)` with `position: fixed`
  computed from `getBoundingClientRect()` at open time (a plain
  `position: absolute` child would get clipped by the PR list's
  `overflow: hidden` table card). Closes on scroll rather than tracking a
  moving anchor.
- **Popover data:** the Timeline already has each run's `ReviewRecord.findings`
  in hand; the PR list only has aggregate counts, so
  `PrFindingsPreview.tsx` lazily calls `usePrReviews(prId)` — it's passed as
  the `Popover`'s `children`, so it only mounts (and only then fetches) once
  hovered, and reuses the same `["reviews", prId]` query key the PR detail
  page uses.
- **`findingItem` deep link:** clicking a popover item or the aggregate row
  sets `?findingItem=<id>` (plus `?sev` and `?tab=findings`).
  `FindingsTab` resolves which review owns it, opens that accordion (reusing
  the existing `targetRunId`/`targetNonce` "jump to review" mechanism), then
  polls with `requestAnimationFrame` (up to 30 frames) for the
  `[data-finding-id]` element to mount before scrolling to it — and always
  clears the param afterward (success or give-up) so a reload never re-scrolls.

## Known gaps

- `SUGGESTION` renders `--sugg` in `FindingCard` but `--accent` in
  `RunTraceDrawer/FindingsSection` — pre-existing divergence, untouched.
- "Blockers" is computed three different ways across the codebase (server
  `countBlockers(findings, ciFailOn)`, `ReviewRunAccordion`'s hardcoded
  `CRITICAL && !dismissed`, denormalized `agent_runs.blockers`) — this feature
  adds a fourth number (severity counts) alongside them rather than
  reconciling the three.

## Out of scope (not built)

- Per-run severity filtering inside a single accordion (only PR-wide "one
  global filter" was requested/confirmed).
- Multi-select severity filter (`?sev=CRITICAL,WARNING`) — single level only.
