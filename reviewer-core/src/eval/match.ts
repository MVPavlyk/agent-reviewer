/**
 * match.ts — the ONE deterministic rule that ties an eval case's expectation
 * to an agent's actual finding (D-3, SPEC-05).
 *
 * Pure, no I/O. Only types are borrowed from `@devdigest/shared`; nothing
 * here imports an LLM provider, a DB client, or the filesystem — see
 * `reviewer-core/src/index.ts`'s module doc for why that boundary matters
 * (this file backs `score()`'s TP/FN/FP/TN classification in `score.ts`).
 */

/** The minimal shape both an expectation and a real finding share for matching. */
export interface MatchTarget {
  file: string;
  start_line: number;
  /** Design's expected-output shape has no `end_line` — see `match()`. */
  end_line?: number;
}

/**
 * normalizePath — strips diff-style prefixes and unifies separators so
 * `a/src/x.ts`, `b/src/x.ts`, `./src/x.ts`, and `/src/x.ts` all compare equal
 * to `src/x.ts`. Comparison after normalization is case-SENSITIVE by design
 * (D-3) — do not lowercase here.
 */
export function normalizePath(path: string): string {
  let p = path.replace(/\\/g, '/');
  while (p.startsWith('./')) p = p.slice(2);
  if (p.startsWith('a/') || p.startsWith('b/')) p = p.slice(2);
  if (p.startsWith('/')) p = p.slice(1);
  return p;
}

/**
 * match — the single exported matching rule (D-3): normalized paths are
 * EQUAL and the line ranges INTERSECT:
 *
 *   exp.start <= f.end_line && f.start_line <= exp.end
 *
 * An expectation without `end_line` (the design's expected-output shape
 * never has one) is treated as `end_line = start_line`. Same fallback
 * applies to `finding` for symmetry, so this also works for the
 * `input_meta.source_finding` zone comparison `score()` needs for FP
 * detection.
 */
export function match(expected: MatchTarget, finding: MatchTarget): boolean {
  if (normalizePath(expected.file) !== normalizePath(finding.file)) return false;
  const expectedEnd = expected.end_line ?? expected.start_line;
  const findingEnd = finding.end_line ?? finding.start_line;
  return expected.start_line <= findingEnd && finding.start_line <= expectedEnd;
}
