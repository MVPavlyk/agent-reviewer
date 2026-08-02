import type { FindingRecord, SeverityCounts } from "@/vendor/shared";

/** Severities shown in the fixed display order (CRITICAL → WARNING → SUGGESTION). */
export const SEVERITY_LEVELS = ["CRITICAL", "WARNING", "SUGGESTION"] as const;
export type SeverityLevel = (typeof SEVERITY_LEVELS)[number];

const KEY_BY_LEVEL: Record<SeverityLevel, keyof SeverityCounts> = {
  CRITICAL: "critical",
  WARNING: "warning",
  SUGGESTION: "suggestion",
};

/** Count of a single level from a SeverityCounts (or null → 0). */
export function countFor(counts: SeverityCounts | null | undefined, level: SeverityLevel): number {
  if (!counts) return 0;
  return counts[KEY_BY_LEVEL[level]];
}

/**
 * Tally findings by severity, excluding dismissed ones. Mirrors the server's
 * `rollupSeverities` (server/src/modules/pulls/status.ts) so the client-side
 * detail-page count and the server-side list-column count agree by
 * construction. Unknown severities are ignored, same as the server.
 */
export function countBySeverity(findings: FindingRecord[]): SeverityCounts {
  const c: SeverityCounts = { critical: 0, warning: 0, suggestion: 0 };
  for (const f of findings) {
    if (f.dismissed_at) continue;
    if (f.severity === "CRITICAL") c.critical += 1;
    else if (f.severity === "WARNING") c.warning += 1;
    else if (f.severity === "SUGGESTION") c.suggestion += 1;
  }
  return c;
}

/** Parses the `?sev` URL param into a valid SeverityLevel, or null. */
export function parseSeverityParam(raw: string | null | undefined): SeverityLevel | null {
  if (!raw) return null;
  return (SEVERITY_LEVELS as readonly string[]).includes(raw) ? (raw as SeverityLevel) : null;
}
