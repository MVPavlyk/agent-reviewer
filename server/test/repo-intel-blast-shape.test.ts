import { describe, it, expect } from 'vitest';
import {
  clampCallersPerSymbol,
  deriveBlastStatus,
  partitionBySupportedExt,
} from '../src/modules/repo-intel/blast.js';
import type { BlastCallerRow } from '../src/modules/repo-intel/types.js';
import { SUPPORTED_EXT } from '../src/modules/repo-intel/constants.js';

function caller(over: Partial<BlastCallerRow>): BlastCallerRow {
  return { file: 'a.ts', symbol: 's', viaSymbol: 'sym', line: 1, rank: 0, ...over };
}

describe('clampCallersPerSymbol', () => {
  it('clamps per symbol, not globally: 30+10 -> 20+10, only the first truncated', () => {
    const rows: BlastCallerRow[] = [];
    for (let i = 0; i < 30; i++) {
      rows.push(caller({ viaSymbol: 'hot', file: `f${i}.ts`, line: i, rank: 30 - i }));
    }
    for (let i = 0; i < 10; i++) {
      rows.push(caller({ viaSymbol: 'cold', file: `g${i}.ts`, line: i, rank: 10 - i }));
    }
    const { bySymbol, flat, anyTruncated } = clampCallersPerSymbol(rows, 20);
    expect(bySymbol.hot!.rows).toHaveLength(20);
    expect(bySymbol.hot!.total).toBe(30);
    expect(bySymbol.hot!.truncated).toBe(true);
    expect(bySymbol.cold!.rows).toHaveLength(10);
    expect(bySymbol.cold!.total).toBe(10);
    expect(bySymbol.cold!.truncated).toBe(false);
    expect(flat).toHaveLength(30);
    expect(anyTruncated).toBe(true);
  });

  it('is deterministic when ranks tie: sorts by file ASC then line ASC', () => {
    const rows: BlastCallerRow[] = [
      caller({ viaSymbol: 's', file: 'b.ts', line: 5, rank: 1 }),
      caller({ viaSymbol: 's', file: 'a.ts', line: 9, rank: 1 }),
      caller({ viaSymbol: 's', file: 'a.ts', line: 2, rank: 1 }),
    ];
    const { bySymbol } = clampCallersPerSymbol(rows, 20);
    expect(bySymbol.s!.rows.map((r) => `${r.file}:${r.line}`)).toEqual(['a.ts:2', 'a.ts:9', 'b.ts:5']);
  });

  it('this exact case fails against the OLD global slice(0,20) behavior', () => {
    // Regression guard: a global slice(0,20) over 30+10 sorted rows would drop
    // ALL 10 "cold" rows (they sort after the first 20 "hot" rows).
    const rows: BlastCallerRow[] = [];
    for (let i = 0; i < 30; i++) rows.push(caller({ viaSymbol: 'hot', file: `f${i}.ts`, rank: 30 - i }));
    for (let i = 0; i < 10; i++) rows.push(caller({ viaSymbol: 'cold', file: `g${i}.ts`, rank: 10 - i }));
    const globalSlice = [...rows].sort((a, b) => b.rank - a.rank).slice(0, 20);
    expect(globalSlice.some((r) => r.viaSymbol === 'cold')).toBe(false);

    const { bySymbol } = clampCallersPerSymbol(rows, 20);
    expect(bySymbol.cold!.rows.length).toBeGreaterThan(0);
  });
});

describe('partitionBySupportedExt', () => {
  it('splits supported (ts/tsx/js/jsx/mjs/cjs) from unsupported (py/md)', () => {
    const { supported, unsupported } = partitionBySupportedExt(
      ['a.ts', 'b.py', 'c.tsx', 'd.md', 'e.mjs'],
      SUPPORTED_EXT,
    );
    expect(supported).toEqual(['a.ts', 'c.tsx', 'e.mjs']);
    expect(unsupported).toEqual(['b.py', 'd.md']);
  });
});

describe('deriveBlastStatus', () => {
  const base = {
    repoIntelEnabled: true,
    hasIndexRow: true,
    indexStatus: 'full' as const,
    indexerVersionMatches: true,
    changedFilesCount: 1,
    unsupportedFilesCount: 0,
    noSymbolsForSupportedFiles: false,
    rankMissingForAllCallers: false,
    anyTruncated: false,
  };

  it('flag_off wins over everything else', () => {
    expect(deriveBlastStatus({ ...base, repoIntelEnabled: false })).toMatchObject({
      status: 'degraded',
      reason: 'flag_off',
    });
  });

  it('no_index when there is no repo_index_state row', () => {
    expect(deriveBlastStatus({ ...base, hasIndexRow: false, indexStatus: null })).toMatchObject({
      status: 'degraded',
      reason: 'no_index',
    });
  });

  it('index_failed when the last index run failed', () => {
    expect(deriveBlastStatus({ ...base, indexStatus: 'failed' })).toMatchObject({
      status: 'degraded',
      reason: 'index_failed',
    });
  });

  it('index_stale when indexerVersion does not match', () => {
    expect(deriveBlastStatus({ ...base, indexerVersionMatches: false })).toMatchObject({
      status: 'degraded',
      reason: 'index_stale',
    });
  });

  it('unsupported_files (degraded) when ALL changed files are unsupported', () => {
    expect(
      deriveBlastStatus({ ...base, changedFilesCount: 2, unsupportedFilesCount: 2 }),
    ).toMatchObject({ status: 'degraded', reason: 'unsupported_files' });
  });

  it('no_symbols when supported files exist but the index has none for them', () => {
    expect(deriveBlastStatus({ ...base, noSymbolsForSupportedFiles: true })).toMatchObject({
      status: 'degraded',
      reason: 'no_symbols',
    });
  });

  it('rank_missing (partial) when no caller file has a rank row', () => {
    expect(deriveBlastStatus({ ...base, rankMissingForAllCallers: true })).toMatchObject({
      status: 'partial',
      reason: 'rank_missing',
    });
  });

  it('index_partial (partial) when the index itself is partial', () => {
    expect(deriveBlastStatus({ ...base, indexStatus: 'partial' })).toMatchObject({
      status: 'partial',
      reason: 'index_partial',
    });
  });

  it('unsupported_files (partial) when SOME (not all) changed files are unsupported', () => {
    expect(
      deriveBlastStatus({ ...base, changedFilesCount: 2, unsupportedFilesCount: 1 }),
    ).toMatchObject({ status: 'partial', reason: 'unsupported_files' });
  });

  it('index_partial (partial) when the caller list was truncated', () => {
    expect(deriveBlastStatus({ ...base, anyTruncated: true })).toMatchObject({
      status: 'partial',
      reason: 'index_partial',
    });
  });

  it('ok with no reason and empty message otherwise', () => {
    expect(deriveBlastStatus(base)).toEqual({ status: 'ok', reason: null, message: '' });
  });
});
