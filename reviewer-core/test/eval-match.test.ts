import { describe, it, expect } from 'vitest';
import { match, normalizePath, type MatchTarget } from '../src/eval/match.js';

describe('normalizePath', () => {
  it('strips a/, b/, ./, leading / and unifies separators', () => {
    expect(normalizePath('a/src/x.ts')).toBe('src/x.ts');
    expect(normalizePath('b/src/x.ts')).toBe('src/x.ts');
    expect(normalizePath('./src/x.ts')).toBe('src/x.ts');
    expect(normalizePath('/src/x.ts')).toBe('src/x.ts');
    expect(normalizePath('src\\x.ts')).toBe('src/x.ts');
    expect(normalizePath('src/x.ts')).toBe('src/x.ts');
  });
});

describe('match (D-3)', () => {
  const cases: {
    name: string;
    expected: MatchTarget;
    finding: MatchTarget;
    want: boolean;
  }[] = [
    {
      name: 'a/-prefixed expected path vs bare finding path',
      expected: { file: 'a/src/x.ts', start_line: 10, end_line: 12 },
      finding: { file: 'src/x.ts', start_line: 10, end_line: 12 },
      want: true,
    },
    {
      name: './-prefixed expected path vs bare finding path',
      expected: { file: './src/x.ts', start_line: 10, end_line: 12 },
      finding: { file: 'src/x.ts', start_line: 10, end_line: 12 },
      want: true,
    },
    {
      name: 'different case in path is NOT a match (case-sensitive)',
      expected: { file: 'src/X.ts', start_line: 10, end_line: 12 },
      finding: { file: 'src/x.ts', start_line: 10, end_line: 12 },
      want: false,
    },
    {
      name: 'ranges touching at the edge intersect',
      expected: { file: 'src/x.ts', start_line: 10, end_line: 12 },
      finding: { file: 'src/x.ts', start_line: 12, end_line: 14 },
      want: true,
    },
    {
      name: 'ranges that do not touch do not intersect',
      expected: { file: 'src/x.ts', start_line: 10, end_line: 12 },
      finding: { file: 'src/x.ts', start_line: 13, end_line: 14 },
      want: false,
    },
    {
      name: 'expectation without end_line falls back to end_line = start_line (matching line)',
      expected: { file: 'src/x.ts', start_line: 12 },
      finding: { file: 'src/x.ts', start_line: 11, end_line: 12 },
      want: true,
    },
    {
      name: 'expectation without end_line falls back to end_line = start_line (non-matching line)',
      expected: { file: 'src/x.ts', start_line: 12 },
      finding: { file: 'src/x.ts', start_line: 13, end_line: 14 },
      want: false,
    },
    {
      name: 'different file, same lines, does not match',
      expected: { file: 'src/x.ts', start_line: 10, end_line: 12 },
      finding: { file: 'src/y.ts', start_line: 10, end_line: 12 },
      want: false,
    },
  ];

  for (const c of cases) {
    it(`${c.name} -> ${c.want}`, () => {
      expect(match(c.expected, c.finding)).toBe(c.want);
    });
  }
});
