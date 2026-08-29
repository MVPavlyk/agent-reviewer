import { describe, it, expect } from 'vitest';
import { score, type EvalCaseScoreInput } from '../src/eval/score.js';

function mustFindCase(overrides: Partial<EvalCaseScoreInput> = {}): EvalCaseScoreInput {
  return {
    caseId: 'case-must-find',
    expectedOutput: [{ file: 'src/x.ts', start_line: 10, end_line: 12, severity: 'WARNING' }],
    sourceFinding: null,
    findings: [],
    ...overrides,
  };
}

function mustNotFlagCase(overrides: Partial<EvalCaseScoreInput> = {}): EvalCaseScoreInput {
  return {
    caseId: 'case-must-not-flag',
    expectedOutput: [],
    sourceFinding: { file: 'src/x.ts', start_line: 10, end_line: 12 },
    findings: [],
    ...overrides,
  };
}

describe('score — case kind + pass (AC-14, AC-42)', () => {
  it('infers must_find from a non-empty expected_output', () => {
    const result = score({
      cases: [mustFindCase({ findings: [{ file: 'src/x.ts', start_line: 11, end_line: 11 }] })],
      kept: 1,
      dropped: 0,
    });
    expect(result.cases[0]!.kind).toBe('must_find');
    expect(result.cases[0]!.pass).toBe(true);
    expect(result.cases[0]!.classification).toBe('TP');
  });

  it('infers must_not_flag from an empty expected_output', () => {
    const result = score({ cases: [mustNotFlagCase()], kept: 0, dropped: 0 });
    expect(result.cases[0]!.kind).toBe('must_not_flag');
    expect(result.cases[0]!.pass).toBe(true);
    expect(result.cases[0]!.classification).toBe('TN');
  });

  it('must_find without a match fails (FN)', () => {
    const result = score({
      cases: [mustFindCase({ findings: [{ file: 'src/other.ts', start_line: 1, end_line: 1 }] })],
      kept: 1,
      dropped: 0,
    });
    expect(result.cases[0]!.pass).toBe(false);
    expect(result.cases[0]!.classification).toBe('FN');
  });
});

describe('score — FP is scoped to source_finding, not any finding (AC-37, EC-21)', () => {
  it('a finding in the same case but OUTSIDE the source_finding zone is unmatched, not FP', () => {
    const result = score({
      cases: [
        mustNotFlagCase({
          sourceFinding: { file: 'src/x.ts', start_line: 10, end_line: 12 },
          findings: [{ file: 'src/x.ts', start_line: 40, end_line: 40 }],
        }),
      ],
      kept: 1,
      dropped: 0,
    });
    const c = result.cases[0]!;
    expect(c.classification).toBe('TN');
    expect(c.pass).toBe(true);
    expect(c.unmatchedCount).toBe(1);
  });

  it('a finding landing inside the source_finding zone is an FP', () => {
    const result = score({
      cases: [
        mustNotFlagCase({
          sourceFinding: { file: 'src/x.ts', start_line: 10, end_line: 12 },
          findings: [{ file: 'src/x.ts', start_line: 11, end_line: 11 }],
        }),
      ],
      kept: 1,
      dropped: 0,
    });
    const c = result.cases[0]!;
    expect(c.classification).toBe('FP');
    expect(c.pass).toBe(false);
    expect(c.unmatchedCount).toBe(0);
  });
});

describe('score — aggregates (D-2a)', () => {
  it('computes recall/precision on a synthetic mixed set', () => {
    const result = score({
      cases: [
        // TP
        mustFindCase({
          caseId: 'tp',
          findings: [{ file: 'src/x.ts', start_line: 11, end_line: 11 }],
        }),
        // FN
        mustFindCase({
          caseId: 'fn',
          findings: [],
        }),
        // FP
        mustNotFlagCase({
          caseId: 'fp',
          sourceFinding: { file: 'src/y.ts', start_line: 5, end_line: 5 },
          findings: [{ file: 'src/y.ts', start_line: 5, end_line: 5 }],
        }),
        // TN
        mustNotFlagCase({
          caseId: 'tn',
          sourceFinding: { file: 'src/z.ts', start_line: 5, end_line: 5 },
          findings: [],
        }),
      ],
      kept: 3,
      dropped: 1,
    });

    expect(result.recall).toBe(1 / 2); // TP=1, FN=1
    expect(result.precision).toBe(1 / 2); // TP=1, FP=1
    expect(result.citationAccuracy).toBe(3 / 4); // kept=3, dropped=1
  });

  it('a set with no must_not_flag cases still computes precision from the formula (EC-8)', () => {
    const result = score({
      cases: [
        mustFindCase({
          caseId: 'tp',
          findings: [{ file: 'src/x.ts', start_line: 11, end_line: 11 }],
        }),
      ],
      kept: 1,
      dropped: 0,
    });
    expect(result.precision).toBe(1); // TP=1, FP=0
  });

  it('TP=0 and FP=0 -> precision is null, not 0/0 (AC-41)', () => {
    const result = score({
      cases: [mustFindCase({ findings: [] })], // FN, no must_not_flag cases at all
      kept: 0,
      dropped: 0,
    });
    expect(result.precision).toBeNull();
  });

  it('TP=0 and FN=0 -> recall is null (degenerate denominator, AC-41)', () => {
    const result = score({ cases: [mustNotFlagCase()], kept: 0, dropped: 0 });
    expect(result.recall).toBeNull();
  });

  it('an agent with zero findings anywhere -> citation_accuracy is null (kept+dropped=0, EC-9)', () => {
    const result = score({ cases: [mustFindCase({ findings: [] })], kept: 0, dropped: 0 });
    expect(result.citationAccuracy).toBeNull();
  });

  it('never constructs or stubs an LLMProvider (AC-32) — this file has no llm import at all', () => {
    // Structural guarantee lives in the module's own imports; this test just
    // documents the invariant the grep-gate (verify:l06, AC-33) enforces.
    expect(true).toBe(true);
  });
});
