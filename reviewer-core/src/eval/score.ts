/**
 * score.ts — deterministic eval scoring (D-2a, SPEC-05).
 *
 * Pure classification (TP/FN/FP/TN) + aggregate metrics for one eval-run
 * batch. NO I/O, no LLM call, no DB, no filesystem — this file must never
 * import `llm/`, `openai`, `@anthropic-ai/sdk`, `postgres`, or `drizzle`
 * (enforced mechanically by `scripts/verify-l06.sh`, step 5 / AC-33, AC-40).
 *
 * The caller (server's batch-executor) is responsible for turning a
 * `reviewer-core` `ReviewOutcome` into the plain `findings`/`kept`/`dropped`
 * numbers this module consumes — `score()` never parses the human-readable
 * `grounding` string (AC-40); it only ever reads `ReviewOutcome`'s numeric
 * fields (`review.findings.length`, `dropped.length`).
 */

import { match, type MatchTarget } from './match.js';

/** A single Finding-like item copied verbatim from `expected_output` (D-2). */
export interface ExpectedFinding extends MatchTarget {
  severity?: string;
  category?: string;
  title?: string;
}

/**
 * The forbidden zone for FP detection (D-2a): `input_meta.source_finding`.
 * Narrower than the case's full diff hunk — a finding elsewhere in the same
 * hunk is `unmatched`, never an FP (AC-37, EC-21).
 */
export interface SourceFindingZone extends MatchTarget {
  end_line: number;
}

export type EvalCaseKind = 'must_find' | 'must_not_flag';
export type EvalCaseClassification = 'TP' | 'FN' | 'FP' | 'TN';

/** One eval case's expectation + the agent's actual findings for that case's diff. */
export interface EvalCaseScoreInput {
  /** Correlates the result back to the caller's `eval_cases.id`. */
  caseId: string;
  /**
   * `expected_output` as stored (D-2). Non-empty -> `must_find`; empty `[]`
   * -> `must_not_flag` (AC-14) — the kind is NEVER stored separately.
   */
  expectedOutput: ExpectedFinding[];
  /**
   * `input_meta.source_finding` zone. Required to detect an FP on a
   * `must_not_flag` case; `null`/`undefined` is treated as "no FP possible"
   * (there is nothing to compare against).
   */
  sourceFinding?: SourceFindingZone | null;
  /** The agent's findings for this case's review (after grounding). */
  findings: MatchTarget[];
}

/** Per-case classification result. */
export interface EvalCaseScoreResult {
  caseId: string;
  kind: EvalCaseKind;
  classification: EvalCaseClassification;
  pass: boolean;
  /** Findings that matched nothing relevant — diagnostic only (AC-37, AC-43). */
  unmatchedCount: number;
}

export interface ScoreInput {
  cases: EvalCaseScoreInput[];
  /** `review.findings.length` from `ReviewOutcome` — grounded findings kept. */
  kept: number;
  /** `dropped.length` from `ReviewOutcome` — findings the citation gate dropped. */
  dropped: number;
}

export interface ScoreResult {
  cases: EvalCaseScoreResult[];
  /** `TP / (TP + FN)`, over `must_find` cases only. `null` on a 0 denominator. */
  recall: number | null;
  /** `TP / (TP + FP)`. `null` on a 0 denominator (AC-41). */
  precision: number | null;
  /** `kept / (kept + dropped)`, batch-wide, from `ReviewOutcome`. `null` on a 0 denominator. */
  citationAccuracy: number | null;
}

function scoreOneCase(input: EvalCaseScoreInput): EvalCaseScoreResult {
  const kind: EvalCaseKind = input.expectedOutput.length > 0 ? 'must_find' : 'must_not_flag';

  if (kind === 'must_find') {
    const matchedFindings = input.findings.filter((f) =>
      input.expectedOutput.some((exp) => match(exp, f)),
    );
    const pass = matchedFindings.length > 0;
    return {
      caseId: input.caseId,
      kind,
      classification: pass ? 'TP' : 'FN',
      pass,
      unmatchedCount: input.findings.length - matchedFindings.length,
    };
  }

  // must_not_flag: FP is ONLY a finding landing inside `sourceFinding`'s zone.
  const zone = input.sourceFinding ?? null;
  const zoneHits = zone ? input.findings.filter((f) => match(zone, f)) : [];
  const fp = zoneHits.length > 0;
  return {
    caseId: input.caseId,
    kind,
    classification: fp ? 'FP' : 'TN',
    pass: !fp,
    unmatchedCount: input.findings.length - zoneHits.length,
  };
}

/** score — classify every case (TP/FN/FP/TN, pass, unmatched_count) and roll up aggregates. */
export function score(input: ScoreInput): ScoreResult {
  const cases = input.cases.map(scoreOneCase);

  const tp = cases.filter((c) => c.classification === 'TP').length;
  const fn = cases.filter((c) => c.classification === 'FN').length;
  const fp = cases.filter((c) => c.classification === 'FP').length;

  const recallDenom = tp + fn;
  const recall = recallDenom === 0 ? null : tp / recallDenom;

  const precisionDenom = tp + fp;
  const precision = precisionDenom === 0 ? null : tp / precisionDenom;

  const citationDenom = input.kept + input.dropped;
  const citationAccuracy = citationDenom === 0 ? null : input.kept / citationDenom;

  return { cases, recall, precision, citationAccuracy };
}
