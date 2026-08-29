/* case-transitions.ts — pure classification of `EvalCompareCase` rows for
   the Compare modal (Крок 18). The server only reports presence (`in_a`/
   `in_b`) and raw `pass_a`/`pass_b` per case (`GET /eval-runs/compare`) —
   classifying what changed between two batches is UI logic, deliberately
   kept out of `CompareModal.tsx` and out of the server (server/CLAUDE.md:
   Крок 11's read routes hand back raw fields on purpose).

   AC-65a fixes the vocabulary this module must use, literally:
   - Y = unique cases present in *at least one* batch — including a case
     that's only in one batch, and a case whose `pass` is `null` in either
     batch. "Nothing to compare against" is still counted.
   - N = cases present in *both* batches, where `pass` is a boolean in
     *both*, and the two values differ. A case can never land in N without
     first being comparable in both batches — "only in A" and "pass=null"
     never count as a regression/improvement, only as Y. */
import type { EvalCompareCase } from "@devdigest/shared";

/** Per-batch verdict for one case: `null` pass reads as "error", never
 *  folded into "fail" (AC-67) — a case that threw during execution is not
 *  the same signal as one that legitimately found the wrong thing. */
export type CaseVerdict = "pass" | "fail" | "error";

export type CaseTransitionKind = "regression" | "improvement" | "unchanged" | "only_a" | "only_b";

export interface ClassifiedCase extends EvalCompareCase {
  /** `null` when the case is absent from that batch (`in_a`/`in_b` false). */
  verdict_a: CaseVerdict | null;
  verdict_b: CaseVerdict | null;
  kind: CaseTransitionKind;
}

function verdict(pass: boolean | null): CaseVerdict {
  if (pass === null) return "error";
  return pass ? "pass" : "fail";
}

function transitionKind(c: EvalCompareCase): CaseTransitionKind {
  if (!c.in_a) return "only_b";
  if (!c.in_b) return "only_a";
  if (c.pass_a !== null && c.pass_b !== null && c.pass_a && !c.pass_b) return "regression";
  if (c.pass_a !== null && c.pass_b !== null && !c.pass_a && c.pass_b) return "improvement";
  return "unchanged";
}

/** Classifies one comparison row. Pure — no sorting, no aggregation. */
export function classifyCase(c: EvalCompareCase): ClassifiedCase {
  return {
    ...c,
    verdict_a: c.in_a ? verdict(c.pass_a) : null,
    verdict_b: c.in_b ? verdict(c.pass_b) : null,
    kind: transitionKind(c),
  };
}

export function classifyCases(cases: EvalCompareCase[]): ClassifiedCase[] {
  return cases.map(classifyCase);
}

/** Regressions (`pass -> fail`, in both batches) sort first (AC-65/EC-16).
 *  Every other row keeps its incoming relative order (stable sort). */
export function sortWithRegressionsFirst(cases: ClassifiedCase[]): ClassifiedCase[] {
  return [...cases].sort((a, b) => {
    const aFirst = a.kind === "regression" ? 0 : 1;
    const bFirst = b.kind === "regression" ? 0 : 1;
    return aFirst - bFirst;
  });
}

export interface CompareSummary {
  /** N — cases present in both batches with a boolean `pass` in both, whose
   *  value differs. Never includes "only in one batch" or `pass = null`. */
  n: number;
  /** Y — unique cases present in at least one batch, no exceptions. */
  y: number;
}

/** "Changed N of Y cases" (AC-65a) — the one line read off the screenshot. */
export function summarizeTransitions(cases: EvalCompareCase[]): CompareSummary {
  const y = cases.length;
  const n = cases.filter(
    (c) => c.in_a && c.in_b && c.pass_a !== null && c.pass_b !== null && c.pass_a !== c.pass_b,
  ).length;
  return { n, y };
}
