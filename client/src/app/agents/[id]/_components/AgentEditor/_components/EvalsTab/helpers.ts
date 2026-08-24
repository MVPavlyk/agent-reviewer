/* helpers.ts — pure formatting/derivation for the Evals tab. No I/O: takes
   already-fetched EvalCaseRecord/EvalBatchRecord data and derives display
   values. Metrics always come from the batch's own pre-computed aggregates
   (AC-44) — nothing here recomputes recall/precision/citation from per-case
   data. */
import type { EvalBatchRecord, EvalCaseRecord } from "@devdigest/shared";

/** One item shape inside a case's `expected_output` (D-2, server/service.ts). */
export interface ExpectedFinding {
  file: string;
  start_line: number;
  end_line: number;
  severity: string;
  category: string;
  title: string;
}

/** The case's expected_output as a typed array — `[]` for `must_not_flag`. */
export function expectedFindings(row: EvalCaseRecord): ExpectedFinding[] {
  return Array.isArray(row.expected_output) ? (row.expected_output as ExpectedFinding[]) : [];
}

/** Type is derived from `expected_output`, never stored separately (AC-14,
 *  mirrors reviewer-core/src/eval/score.ts's server-side rule). */
export function caseKind(row: EvalCaseRecord): "must_find" | "must_not_flag" {
  return expectedFindings(row).length > 0 ? "must_find" : "must_not_flag";
}

export type CaseRunStatus = "passed" | "failed" | "never_run";

export function caseRunStatus(row: EvalCaseRecord): CaseRunStatus {
  if (!row.last_run || row.last_run.pass == null) return "never_run";
  return row.last_run.pass ? "passed" : "failed";
}

/**
 * "expected N findings, got M" (AC-52). `expected_output` gives an exact N;
 * the case read model (`EvalCaseRecord.last_run`) only carries `pass`, not
 * the run's actual finding count, so M is the closest true statement
 * derivable from pass/fail: for `must_find`, a pass means >=1 expected
 * finding was matched (shown as N, the common case is N=1); a fail means
 * none was. For `must_not_flag` (N=0), a pass means no finding landed in
 * the forbidden zone (0); a fail means one did (shown as 1).
 */
export function expectedGotCounts(row: EvalCaseRecord): { expected: number; got: number | null } {
  const expected = expectedFindings(row).length;
  const status = caseRunStatus(row);
  if (status === "never_run") return { expected, got: null };
  if (expected > 0) return { expected, got: status === "passed" ? expected : 0 };
  return { expected, got: status === "passed" ? 0 : 1 };
}

/** "CRITICAL · security" for a `must_find` case, "empty []" for `must_not_flag`. */
export function caseBadgeLabel(row: EvalCaseRecord): string {
  const findings = expectedFindings(row);
  const first = findings[0];
  if (!first) return "empty []";
  return `${first.severity.toUpperCase()} · ${first.category}`;
}

/** AC-51: X = cases with `pass = true` on the *latest* batch's own run,
 *  Y = total case count. A "never run" case (or one whose last run belongs
 *  to an older batch) counts in Y, never in X. */
export function passingSummary(
  cases: EvalCaseRecord[] | undefined,
  latestBatch: EvalBatchRecord | null,
): { passing: number; total: number } {
  const rows = cases ?? [];
  const passing = latestBatch
    ? rows.filter((c) => c.last_run?.batch_id === latestBatch.id && c.last_run.pass === true).length
    : 0;
  return { passing, total: rows.length };
}

export interface TileMetricDelta {
  recall: number | null;
  precision: number | null;
  citation_accuracy: number | null;
  traces_passed: number | null;
}

/** Per-tile deltas (latest batch vs. the one immediately before it in the
 *  newest-first `batches` list — index 1). `null` when there is no previous
 *  batch: no delta element renders at all, never "▲0" (same rule AC-60
 *  applies on the agent page). `traces_passed`'s delta is on the pass
 *  *rate* (`traces_passed / traces_total`), so it is comparable across
 *  batches with a different case count. */
export function tabMetricDelta(batches: EvalBatchRecord[] | undefined): TileMetricDelta | null {
  const rows = batches ?? [];
  const [latest, previous] = rows; // hook returns newest-first
  if (!latest || !previous) return null;
  const diff = (a: number | null, b: number | null) => (a == null || b == null ? null : a - b);
  const passRate = (b: EvalBatchRecord) =>
    b.traces_total == null || b.traces_total === 0 ? null : (b.traces_passed ?? 0) / b.traces_total;
  return {
    recall: diff(latest.recall, previous.recall),
    precision: diff(latest.precision, previous.precision),
    citation_accuracy: diff(latest.citation_accuracy, previous.citation_accuracy),
    traces_passed: diff(passRate(latest), passRate(previous)),
  };
}

/** AC-49a: how many of a `partial` batch's own cases have no pass/fail
 *  verdict yet — `case_ids.length` minus cases whose last run (i) belongs
 *  to this batch and (ii) has a non-null `pass`. */
export function notRanCount(batch: EvalBatchRecord, cases: EvalCaseRecord[] | undefined): number {
  const rows = cases ?? [];
  const ranInBatch = new Set(
    rows.filter((c) => c.last_run?.batch_id === batch.id && c.last_run.pass !== null).map((c) => c.id),
  );
  return batch.case_ids.filter((id) => !ranInBatch.has(id)).length;
}
