import type { FindingRecord } from "@devdigest/shared";

/** Join an AgentColumn's finding ids with the PR's full findings (from
 *  `usePrReviews`) to get body/suggestion/confidence for the detail cards
 *  (AC-21/22). Findings the join can't resolve yet (still loading) are
 *  skipped rather than rendered half-empty. */
export function resolveFindings(ids: string[], allFindings: FindingRecord[]): FindingRecord[] {
  const byId = new Map(allFindings.map((f) => [f.id, f]));
  return ids.map((id) => byId.get(id)).filter((f): f is FindingRecord => f != null);
}
