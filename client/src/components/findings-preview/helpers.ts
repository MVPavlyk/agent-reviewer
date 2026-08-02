import type { FindingRecord } from "@devdigest/shared";
import { SEVERITY_LEVELS } from "@/components/severity-counts";

/** Non-dismissed findings, sorted CRITICAL → WARNING → SUGGESTION — the order
 *  the preview list and its severity counts agree on. */
export function visibleSortedFindings(findings: FindingRecord[]): FindingRecord[] {
  return findings
    .filter((f) => !f.dismissed_at)
    .sort((a, b) => SEVERITY_LEVELS.indexOf(a.severity) - SEVERITY_LEVELS.indexOf(b.severity));
}
