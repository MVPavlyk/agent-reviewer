import type { FindingRecord } from "@devdigest/shared";

/** Format a finding's line range ("11" when single-line, else "11-15"). */
export function lineLabel(f: Pick<FindingRecord, "start_line" | "end_line">): string {
  return f.start_line === f.end_line ? `${f.start_line}` : `${f.start_line}-${f.end_line}`;
}

/** "Turn into eval case" only applies to regular findings — hook detectors
 *  (secret_leak/phantom/lethal_trifecta/hook) never get the button (EC-23). */
export function isEligibleForEvalCase(f: Pick<FindingRecord, "kind">): boolean {
  return f.kind == null || f.kind === "finding";
}

/** A finding must be accepted or dismissed before it can become an eval case
 *  (AC-15) — an unmarked finding has no `expected_output` to derive. */
export function isFindingResolved(f: Pick<FindingRecord, "accepted_at" | "dismissed_at">): boolean {
  return !!f.accepted_at || !!f.dismissed_at;
}
