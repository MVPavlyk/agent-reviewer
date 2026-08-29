import { describe, it, expect } from 'vitest';
import type { BlastRadius, BriefCore } from '@devdigest/shared';
import { allowedRefs, groundBrief, normalizeRef } from '../src/modules/reviews/brief/grounding.js';

function blast(overrides: Partial<BlastRadius> = {}): BlastRadius {
  return {
    changed_symbols: [],
    downstream: [],
    summary: 's',
    status: 'ok',
    reason: null,
    message: '',
    coverage: {
      changed_files: [],
      analyzed_files: [],
      unsupported_files: [],
      files_without_rank: [],
      indexer_version: null,
      last_indexed_sha: null,
    },
    head_sha: null,
    ...overrides,
  };
}

function core(overrides: Partial<BriefCore> = {}): BriefCore {
  return {
    what: 'w',
    why: 'y',
    risk_level: 'medium',
    risks: [],
    review_focus: [],
    ...overrides,
  };
}

describe('brief/grounding — normalizeRef', () => {
  it('trims, strips leading ./ and /, and keeps case', () => {
    expect(normalizeRef('  ./src/a.ts  ')).toBe('src/a.ts');
    expect(normalizeRef('/src/A.ts')).toBe('src/A.ts');
    expect(normalizeRef('src/a.ts')).toBe('src/a.ts');
  });
});

describe('brief/grounding — allowedRefs (AC-15)', () => {
  it('includes changed files + blast symbols/callers/endpoints/crons', () => {
    const allowed = allowedRefs({
      files: ['src/a.ts'],
      blast: blast({
        changed_symbols: [{ name: 'fn', file: 'src/b.ts', kind: 'function' }],
        downstream: [
          {
            symbol: 'fn',
            callers: [{ name: 'caller', file: 'src/c.ts', line: 1, rank: 0.5 }],
            callers_total: 1,
            callers_truncated: false,
            endpoints_affected: [
              { value: 'GET /x', file: 'src/d.ts', via_symbol: null, via_file: 'src/d.ts', depth: 0 },
            ],
            crons_affected: [
              { value: 'nightly-job', file: 'src/e.ts', via_symbol: null, via_file: 'src/e.ts', depth: 1 },
            ],
          },
        ],
      }),
    });
    expect(allowed).toEqual(
      new Set(['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/d.ts', 'GET /x', 'src/e.ts', 'nightly-job']),
    );
  });

  it('EC-2: diff_not_loaded degraded blast → allowed set is just the changed files', () => {
    const allowed = allowedRefs({
      files: ['src/a.ts'],
      blast: blast({ status: 'degraded', reason: 'diff_not_loaded' }),
    });
    expect(allowed).toEqual(new Set(['src/a.ts']));
  });
});

describe('brief/grounding — groundBrief', () => {
  it('AC-16: drops review_focus items citing a file outside the allowed set', () => {
    const b = core({
      review_focus: [
        { file: 'src/a.ts', line: 1, reason: 'real' },
        { file: 'src/made-up.ts', line: 1, reason: 'hallucinated' },
      ],
    });
    const { brief, droppedRefs } = groundBrief(b, new Set(['src/a.ts']));
    expect(brief.review_focus).toEqual([{ file: 'src/a.ts', line: 1, reason: 'real' }]);
    expect(droppedRefs).toBe(1);
  });

  it('AC-17: partially cleans a risk\'s file_refs; total wipeout drops the risk', () => {
    const b = core({
      risks: [
        {
          kind: 'security',
          title: 'partial',
          explanation: 'e',
          severity: 'high',
          file_refs: ['src/a.ts', 'src/made-up.ts'],
        },
        {
          kind: 'security',
          title: 'all fake',
          explanation: 'e',
          severity: 'low',
          file_refs: ['src/made-up-2.ts'],
        },
      ],
    });
    const { brief, droppedRefs } = groundBrief(b, new Set(['src/a.ts']));
    expect(brief.risks).toHaveLength(1);
    expect(brief.risks[0]!.title).toBe('partial');
    expect(brief.risks[0]!.file_refs).toEqual(['src/a.ts']);
    expect(droppedRefs).toBe(2);
  });

  it('AC-19: everything hallucinated → empty risks/review_focus, no throw', () => {
    const b = core({
      risks: [{ kind: 'x', title: 't', explanation: 'e', severity: 'low', file_refs: ['nope.ts'] }],
      review_focus: [{ file: 'nope.ts', line: null, reason: 'r' }],
    });
    expect(() => groundBrief(b, new Set())).not.toThrow();
    const { brief } = groundBrief(b, new Set());
    expect(brief.risks).toEqual([]);
    expect(brief.review_focus).toEqual([]);
  });

  it('AC-20: risk_level is preserved unchanged after grounding', () => {
    const b = core({ risk_level: 'high', risks: [{ kind: 'x', title: 't', explanation: 'e', severity: 'low', file_refs: ['nope.ts'] }] });
    const { brief } = groundBrief(b, new Set());
    expect(brief.risk_level).toBe('high');
  });

  it('EC-3/EC-4: a risk whose file_refs is already empty is dropped too (no refs to ground)', () => {
    const b = core({
      risks: [{ kind: 'x', title: 't', explanation: 'e', severity: 'low', file_refs: [] }],
    });
    const { brief, droppedRefs } = groundBrief(b, new Set(['src/a.ts']));
    expect(brief.risks).toEqual([]);
    expect(droppedRefs).toBe(0);
  });
});
