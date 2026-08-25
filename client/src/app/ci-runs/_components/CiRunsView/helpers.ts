import type { CiRun, Verdict } from "@devdigest/shared";

/**
 * `CiRun.repo` (joined server-side from `ci_installations`) is the primary
 * source for the repo column — see `CiRunsView.tsx`. This stays as a
 * fallback for rows where `repo` is `null` (e.g. the run's installation was
 * deleted, EC-7) but a GitHub Actions job link is still present: derive a
 * best-effort "owner/repo" from the run URL itself
 * (`.../<owner>/<repo>/actions/runs/<id>`). `null` when there is no link to
 * parse (EC-10/11).
 */
export function repoFromGithubUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\//.exec(url);
  return m ? `${m[1]}/${m[2]}` : null;
}

/** `null`/non-finite → "—"; otherwise seconds to one decimal (e.g. "8.2s"). */
export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return "—";
  return `${(ms / 1000).toFixed(1)}s`;
}

/** The i18n key (under `runs.verdict`) for a run's verdict. `null` (no
 *  ingest yet, or a run predating the `verdict` column) is "unknown". */
export function verdictKey(verdict: Verdict | null | undefined): string {
  if (verdict === "request_changes" || verdict === "approve" || verdict === "comment") return verdict;
  return "unknown";
}

/** Newest-first, defensively re-sorted (the API already orders by `ran_at`
 *  desc, same guard as `CITab/helpers.ts::sortedRuns`). */
export function sortedByRanAt(runs: CiRun[]): CiRun[] {
  return [...runs].sort((a, b) => (b.ran_at ?? "").localeCompare(a.ran_at ?? ""));
}
