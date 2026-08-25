import type { FindingRecord } from "@devdigest/shared";
import type { ResultsMode } from "../ModeToggle";

/** URL `?mode=` → a valid ResultsMode, defaulting to "columns" for anything
 *  else (missing param, typo, stale bookmark). */
export function parseMode(raw: string | null): ResultsMode {
  return raw === "tabs" ? "tabs" : "columns";
}

/** Join an AgentColumn's finding ids with the PR's full findings (from
 *  `usePrReviews`) to get the full FindingRecord shape the shared
 *  RunTraceDrawer expects (AC-16). Unresolved ids (still loading) are
 *  skipped rather than passed half-empty. */
export function resolveFindings(ids: string[], allFindings: FindingRecord[]): FindingRecord[] {
  const byId = new Map(allFindings.map((f) => [f.id, f]));
  return ids.map((id) => byId.get(id)).filter((f): f is FindingRecord => f != null);
}
