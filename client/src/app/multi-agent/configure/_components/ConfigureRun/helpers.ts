import type { AgentEstimate } from "@devdigest/shared";

export interface SelectionEstimate {
  maxTimeMs: number | null;
  sumCostUsd: number | null;
  /** True when at least one selected agent has no run history yet (AC-7) —
   *  it's excluded from the aggregate, not treated as zero. */
  partial: boolean;
}

/** Local re-derivation of the pre-run estimate over the currently-selected
 *  subset (AC-5/AC-6/AC-7) — no network call per checkbox toggle, just a
 *  recompute over the already-fetched per-agent estimates. */
export function estimateForSelection(
  perAgent: AgentEstimate[] | undefined,
  selectedIds: string[],
): SelectionEstimate {
  const selected = selectedIds.map((id) => perAgent?.find((e) => e.agent_id === id));
  const withHistory = selected.filter(
    (e): e is AgentEstimate => e != null && e.time_ms != null && e.cost_usd != null,
  );
  const partial = withHistory.length < selectedIds.length;
  if (withHistory.length === 0) {
    return { maxTimeMs: null, sumCostUsd: null, partial };
  }
  return {
    maxTimeMs: Math.max(...withHistory.map((e) => e.time_ms!)),
    sumCostUsd: withHistory.reduce((sum, e) => sum + e.cost_usd!, 0),
    partial,
  };
}
