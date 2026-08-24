/* helpers.ts — pure formatting/derivation for the Eval Dashboard. No I/O:
   takes already-fetched EvalDashboardAgentRow data and derives display
   values. Metrics always come from each row's own `latest_batch` aggregates
   (AC-44) — nothing here recomputes recall/precision/citation. */
import type { EvalBatchRecord } from "@devdigest/shared";
import type { EvalDashboardAgentRow } from "@/lib/hooks/evals";

/** Re-exported so existing imports of `versionLabel`/`passLabel` from this
 *  module keep working — the implementations now live in
 *  `@/components/eval-batch/format` (promoted once CompareModal, Крок 18,
 *  became a third independent consumer). */
export { versionLabel, passLabel } from "@/components/eval-batch/format";

export interface RecentRunRow {
  agent_id: string;
  agent_name: string;
  batch: EvalBatchRecord;
}

/** One row per agent that has actually run at least once, newest first —
 *  the dashboard's "recent runs" table. An agent whose `latest_batch` is
 *  `null` (never run) contributes no row here — the table never shows a
 *  fabricated zero-run (AC-58/EC-11). */
export function recentRuns(rows: EvalDashboardAgentRow[]): RecentRunRow[] {
  return rows
    .filter((row): row is EvalDashboardAgentRow & { latest_batch: EvalBatchRecord } => row.latest_batch != null)
    .map((row) => ({ agent_id: row.agent_id, agent_name: row.agent_name, batch: row.latest_batch }))
    .sort((a, b) => Date.parse(b.batch.started_at) - Date.parse(a.batch.started_at));
}

