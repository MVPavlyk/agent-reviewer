/** Pure helpers for DiffTab — client-side mirror of the server's "latest
 *  review" aggregation (server/src/modules/pulls/repository.ts:
 *  latestReviewFindingLines), so the Smart Diff inline severity badges agree
 *  with the server's finding_lines by construction. See client/INSIGHTS.md
 *  ("countBySeverity duplicates rollupSeverities client-side") for the
 *  precedent that justifies this duplication instead of a round trip. */
import type { ReviewRecord, Severity } from "@devdigest/shared";

const SEVERITY_RANK: Record<Severity, number> = {
  CRITICAL: 3,
  WARNING: 2,
  SUGGESTION: 1,
};

/** Reviews come newest-first (server order). The "latest review" is the most
 *  recent `kind: 'review'` row; a multi-agent run produces several reviews
 *  sharing one `run_id` — all of them count as "the latest review". */
function latestReviewRuns(reviews: ReviewRecord[]): ReviewRecord[] {
  const runs = reviews.filter((r) => r.kind === "review");
  if (runs.length === 0) return [];
  const latest = runs[0]!;
  if (latest.run_id == null) return [latest];
  return runs.filter((r) => r.run_id === latest.run_id);
}

/**
 * Builds `file path -> (new-file line number -> severity)` from the latest
 * review run, expanding each finding's `start_line..end_line` range and
 * excluding dismissed findings. When a line is covered by more than one
 * finding, the more severe one wins.
 */
export function severityByFileLine(reviews: ReviewRecord[]): Map<string, Map<number, Severity>> {
  const result = new Map<string, Map<number, Severity>>();
  for (const review of latestReviewRuns(reviews)) {
    for (const finding of review.findings) {
      if (finding.dismissed_at) continue;
      let fileMap = result.get(finding.file);
      if (!fileMap) {
        fileMap = new Map();
        result.set(finding.file, fileMap);
      }
      for (let line = finding.start_line; line <= finding.end_line; line++) {
        const existing = fileMap.get(line);
        if (!existing || SEVERITY_RANK[finding.severity] > SEVERITY_RANK[existing]) {
          fileMap.set(line, finding.severity);
        }
      }
    }
  }
  return result;
}
