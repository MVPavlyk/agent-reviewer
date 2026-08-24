/* format.ts — batch-display formatters shared across the Eval Dashboard
   (`app/evals/_components/EvalDashboardView`), an agent's eval history page
   (`app/evals/[agentId]/_components/AgentEvalView`), and the Compare modal
   (`app/evals/[agentId]/_components/CompareModal`, Крок 18). Promoted here
   once the Compare modal became a third independent consumer of the same
   two functions — frontend-architecture's "promote on the second consumer"
   rule, applied one consumer late on purpose (see Крок 18 implementation
   report's "Якорі" for the two call sites this replaced). */
import type { EvalBatchRecord } from "@devdigest/shared";

/** "vN" from a batch's `agent_version` snapshot. */
export function versionLabel(agentVersion: number): string {
  return `v${agentVersion}`;
}

/** "N/M" pass count off the batch's own aggregates — "—" when the batch has
 *  no `traces_total` yet (a `running` batch whose aggregate isn't computed). */
export function passLabel(batch: Pick<EvalBatchRecord, "traces_passed" | "traces_total">): string {
  if (batch.traces_total == null) return "—";
  return `${batch.traces_passed ?? 0}/${batch.traces_total}`;
}

/** "▲12%" / "▼8%" / "±0%" for a metric delta (already latest-minus-previous),
 *  "—" for a `null`/non-finite delta (one side of the pair was `null`).
 *  Moved here from `AgentEvalView/helpers.ts` once the Evals tab
 *  (`AgentEditor/_components/EvalsTab`) became a second consumer of the same
 *  formatting rule. */
export function formatDelta(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const pct = Math.round(value * 100);
  if (pct === 0) return "±0%";
  return pct > 0 ? `▲${pct}%` : `▼${Math.abs(pct)}%`;
}
