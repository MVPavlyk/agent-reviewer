import type { CiRun, CiRunStatus } from "@devdigest/shared";

/** Compact relative time for installation/run timestamps. Mirrors
 *  `app/conventions/_components/ConventionsListView/helpers.ts::relativeTime`
 *  — not imported from there since that file is private to its own route
 *  (import-hygiene: each feature colocates its own copy). */
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "—";
  const m = Math.max(0, Math.round((Date.now() - then) / 60_000));
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

/** The i18n key (under `ciTab.runStatus`) for an installation's latest-run
 *  status. `null` (no run yet, AC-12/EC-2) maps to the neutral "notRun". */
export function runStatusKey(status: CiRunStatus | string | null | undefined): string {
  if (status === "succeeded" || status === "failed" || status === "running" || status === "no_findings") {
    return status;
  }
  return "notRun";
}

/** Newest-first run history, capped defensively — the server already caps
 *  at 10 (RUN_HISTORY_LIMIT), this just guards against a future change. */
export function sortedRuns(runs: CiRun[]): CiRun[] {
  return [...runs].sort((a, b) => (b.ran_at ?? "").localeCompare(a.ran_at ?? ""));
}
