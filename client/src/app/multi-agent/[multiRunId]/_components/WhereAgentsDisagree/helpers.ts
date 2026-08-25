import type { Conflict, ConflictTake } from "@devdigest/shared";

/** A group is a conflict iff its takes are NOT unanimous: any take is
 *  'ignored' (agent did not flag it) while another flagged it, OR flagged
 *  takes carry more than one distinct severity. Computed client-side per
 *  SPEC-06 — the server sends every cross-agent group (conflicts +
 *  agreement), and the toggle just filters which ones show. */
export function isConflict(takes: ConflictTake[]): boolean {
  const flagged = takes.filter((t) => t.verdict !== "ignored");
  const ignored = takes.some((t) => t.verdict === "ignored");
  if (flagged.length === 0) return false;
  if (ignored && flagged.length > 0) return true;
  const distinctSeverities = new Set(flagged.map((t) => t.verdict));
  return distinctSeverities.size > 1;
}

export function visibleGroups(conflicts: Conflict[], onlyConflicts: boolean): Conflict[] {
  return onlyConflicts ? conflicts.filter((c) => isConflict(c.takes)) : conflicts;
}
