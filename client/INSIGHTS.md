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
- **2026-08-02** — Rendering a `FindingRecord.file` (full repo path) unbounded in a narrow popover/tooltip breaks layout for deeply-nested paths — show only the basename (`path.slice(path.lastIndexOf("/") + 1)`) and put the full path in a `title` tooltip instead — `client/src/app/repos/[repoId]/pulls/[number]/_components/RunHistory/FindingsPreviewList.tsx:8`

## Codebase Patterns
- **2026-08-01** — The PR list is a CSS-grid fake table: a new column means editing `GRID`, `COLUMN_KEYS` and the row cells together. Insert before `updated`, since `page.tsx` right-aligns only `COLUMN_KEYS[length-1]` — `client/src/app/repos/[repoId]/pulls/constants.ts:27`
- **2026-08-02** — `?findingItem=<id>` deep-link (from the Timeline popover) scrolls to a `FindingCard` via `document.querySelector('[data-finding-id="..."]')` polled with `requestAnimationFrame` (up to 30 frames) — a plain post-effect query fails because the owning `ReviewRunAccordion` must first flip `open` (driven by the existing `targetRunId`/`targetNonce` mechanism) and re-render before the card exists in the DOM. Always call the "handled" callback (clears the URL param) on both success and give-up, so a reload never re-triggers the scroll — `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsTab/FindingsTab.tsx`

## Tool & Library Notes

## Recurring Errors & Fixes
- **2026-08-01** — Rendering a component that pulls a NEW i18n namespace breaks existing tests silently-late: `NextIntlClientProvider` in a test only carries the namespaces it is handed. Adding `RunCostBadge` (namespace `common`) to `RunHistory` required `messages={{ prReview: messages, common }}` — `client/src/app/repos/[repoId]/pulls/[number]/_components/RunHistory/RunHistory.test.tsx:39`

## Decisions
- **2026-08-02** — `countBySeverity()` in `components/severity-counts/helpers.ts` intentionally duplicates the server's `rollupSeverities` logic client-side (same "exclude dismissed_at" rule) instead of trusting only the server aggregate — keeps the PR-detail counter row (computed client-side from `FindingRecord[]`) and the PR-list FINDINGS column (server-computed) in agreement by construction — `client/src/components/severity-counts/helpers.ts:20`
- **2026-08-02** — Never use browser tools (screenshot/click/scroll) to manually verify a change — rely on `pnpm test` + `pnpm typecheck` instead; ask the user if visual confirmation is needed — explicit user instruction, also recorded in `client/CLAUDE.md` under "Verification"
- **2026-08-02** — Timeline (`RunHistory`) and Review-runs (`ReviewRunAccordion`) read findings from two different sources: `RunSummary`/`agent_runs` only carries denormalized `findings_count`/`blockers` (no severity split), but `ReviewRecord.findings` (same `reviews` data `FindingsTab` already has) carries real per-finding severity keyed by `run_id`. Built `severityByRunId` in `FindingsTab` (mirrors `costByRunId`) and passed it into `RunHistory` as an optional prop — falls back to the old "N findings · M blockers" text when a run has no matching review (e.g. failed run) — `client/src/app/repos/[repoId]/pulls/[number]/_components/RunHistory/RunHistory.tsx:23`
- **2026-08-02** — No Popover/Tooltip primitive existed anywhere in `vendor/ui` (checked every file in `primitives/`) before the Timeline findings-hover popup — added a minimal one (`vendor/ui/primitives/Popover.tsx`, no positioning library, `position:relative` trigger wrapper + `position:absolute` panel, 150ms close-delay so the pointer can travel trigger→panel). Use `fireEvent.mouseOver`/`mouseOut` (not `mouseEnter`/`mouseLeave`) in RTL tests — React's enter/leave synthetic events are derived from bubbling `mouseover`/`mouseout`, and jsdom's raw non-bubbling `mouseenter`/`mouseleave` don't reliably trigger React's `onMouseEnter`/`onMouseLeave` handlers — `client/src/app/repos/[repoId]/pulls/[number]/_components/RunHistory/RunHistory.test.tsx`
- **2026-08-02** — `Popover` (vendor/ui) renders through `createPortal(document.body)` with `position: fixed` computed from the trigger's `getBoundingClientRect()` at open time, NOT a plain `position: absolute` child of the trigger — the PR-list's `tableCard` has `overflow: hidden` (rounded card corners) and would clip an absolutely-positioned child popover. Closes on any scroll (position is only captured once, not tracked). `client/src/vendor/ui/primitives/Popover.tsx`
- **2026-08-02** — Moved `FindingsPreviewList` out of `RunHistory/` into `src/components/findings-preview/` (alongside a new `PrFindingsPreview` loader) so the same popover content renders both from the PR-detail Timeline (already has `ReviewRecord.findings` in hand) and the PR-list row (which only has aggregate `SeverityCounts` — `PrFindingsPreview` lazily calls `usePrReviews(prId)` on mount, and since it's passed as `Popover`'s `children`, it only mounts — and only then fetches — once the popover opens on hover). Reuses the same `["reviews", prId]` query key as the PR detail page, so opening that PR next is already warm.
- **2026-08-02** — `SeverityCounts` compact-variant badges now accept the same `onSelect` prop as the detailed variant, but with different semantics: detailed toggles (click selected → fires `null`), compact always fires that exact level (no toggle state — it's a "jump" action, not an in-place filter). Every clickable compact badge calls `e.stopPropagation()` since compact badges always live inside something else clickable (a `Popover` trigger, itself often inside a clickable row) — `client/src/components/severity-counts/SeverityCounts.tsx`
- **2026-08-02** — Same severity-badge click means two different things depending on where it fires: in `PRRow` (not yet on the PR) it's `router.push` to `/repos/:id/pulls/:number?tab=findings&sev=X` — full cross-page navigation. In `RunHistory`'s Timeline (already on that PR's Agent-runs tab) it instead calls the same `onSelectSeverity` prop the page already threads into the aggregate counter row, which does `setParam("sev", X)` (`router.replace`, no new history entry) — reuses the existing global-filter state instead of building a second parallel URL/filter mechanism.

## Session Notes

## Open Questions
