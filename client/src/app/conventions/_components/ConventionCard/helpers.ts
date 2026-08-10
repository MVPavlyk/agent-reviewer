import type { ConventionCandidate } from "@devdigest/shared";

/** Format a convention's line range ("11" when single-line or end missing,
 *  else "11-15"). Mirrors FindingCard's `lineLabel`. */
export function lineLabel(c: Pick<ConventionCandidate, "start_line" | "end_line">): string {
  if (c.start_line == null) return "";
  if (c.end_line == null || c.end_line === c.start_line) return `${c.start_line}`;
  return `${c.start_line}-${c.end_line}`;
}

/** Same ok/warn/muted threshold as the `ConfidenceNum` primitive (85%/65%). */
export function confidenceColor(pct: number): string {
  return pct >= 85 ? "var(--ok)" : pct >= 65 ? "var(--warn)" : "var(--text-muted)";
}
