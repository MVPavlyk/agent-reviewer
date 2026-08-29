/* format.ts — shared eval-metric formatting (recall / precision / citation
   accuracy). Promoted out of the Evals tab (client/agents/[id]) once the Eval
   Dashboard (client/evals) became a second consumer — frontend-architecture's
   "promote on the second consumer" rule. Mirrors run-cost-badge/format.ts's
   pattern: a domain-named formatter colocated under components/, not utils/. */

/** `null`/`undefined`/non-finite -> "—" (never "0" — AC-41, AC-50), else a
 *  0-100 percentage. Metrics are pre-computed batch aggregates; this never
 *  recomputes a ratio itself. */
export function formatMetric(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(0)}%`;
}
