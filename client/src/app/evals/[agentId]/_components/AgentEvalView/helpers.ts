/* helpers.ts — pure formatting/derivation for one agent's eval history page.
   No I/O: takes already-fetched EvalBatchRecord[] and derives display values.
   Metrics always come from each batch's own pre-computed aggregates
   (AC-44/NFR-1) — nothing here recomputes recall/precision/citation. */
import type { EvalBatchRecord } from "@devdigest/shared";
import type { ChartSeries } from "@/vendor/ui/charts/LineChart";

/** Re-exported so existing imports of `versionLabel`/`passLabel`/`formatDelta`
 *  from this module keep working — the implementations now live in
 *  `@/components/eval-batch/format` (promoted once CompareModal, Крок 18,
 *  and the Evals tab's per-tile deltas became further independent consumers). */
export { versionLabel, passLabel, formatDelta } from "@/components/eval-batch/format";

/** Batches oldest → newest — the trend chart's x-axis order. */
export function chronological(batches: EvalBatchRecord[]): EvalBatchRecord[] {
  return [...batches].sort((a, b) => Date.parse(a.started_at) - Date.parse(b.started_at));
}

/** Batches newest → oldest — the runs table's row order. */
export function byRecency(batches: EvalBatchRecord[]): EvalBatchRecord[] {
  return [...batches].sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at));
}

const SERIES_COLOR = {
  recall: "var(--accent)",
  precision: "var(--ok)",
  citation: "var(--warn)",
} as const;

/** Three-series (recall/precision/citation) trend for the existing
 *  `LineChart` wrapper, oldest → newest. A missing aggregate renders as 0 on
 *  the line — `LineChart` has no gap rendering — this never claims a null
 *  aggregate is a real zero anywhere else in the UI (formatMetric owns that
 *  distinction for numeric text). */
export function trendSeries(batches: EvalBatchRecord[]): ChartSeries[] {
  const ordered = chronological(batches);
  return [
    { name: "recall", color: SERIES_COLOR.recall, data: ordered.map((b) => b.recall ?? 0) },
    { name: "precision", color: SERIES_COLOR.precision, data: ordered.map((b) => b.precision ?? 0) },
    { name: "citation", color: SERIES_COLOR.citation, data: ordered.map((b) => b.citation_accuracy ?? 0) },
  ];
}

export interface MetricDelta {
  recall: number | null;
  precision: number | null;
  citation_accuracy: number | null;
}

/** Delta of the latest batch vs. the one immediately before it. `null` when
 *  there is no previous batch — a first run renders no delta element at all,
 *  never "▲0" (AC-60). A per-field `null` means one side of the pair has a
 *  `null` aggregate (e.g. precision undefined when TP=FP=0). */
export function latestDelta(batches: EvalBatchRecord[]): MetricDelta | null {
  const [latest, previous] = byRecency(batches);
  if (!latest || !previous) return null;
  const diff = (a: number | null, b: number | null) => (a == null || b == null ? null : a - b);
  return {
    recall: diff(latest.recall, previous.recall),
    precision: diff(latest.precision, previous.precision),
    citation_accuracy: diff(latest.citation_accuracy, previous.citation_accuracy),
  };
}

/** `Compare` is enabled only for exactly two batches belonging to the same
 *  agent — written against `agent_id`, not "this page has one agent",
 *  because the runs table this predicate guards is reused wherever a
 *  multi-agent batch list appears (EC-14). */
export function canCompare(selected: EvalBatchRecord[]): boolean {
  const [a, b] = selected;
  return selected.length === 2 && !!a && !!b && a.agent_id === b.agent_id;
}
