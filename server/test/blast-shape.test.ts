import { describe, it, expect } from 'vitest';
import { BlastRadius } from '@devdigest/shared';
import { toBlastRadius } from '../src/modules/blast/shape.js';
import type { BlastResult } from '../src/modules/repo-intel/types.js';

function okResult(): BlastResult {
  return {
    changedSymbols: [{ file: 'a.ts', name: 'rateLimit', kind: 'function' }],
    callers: [{ file: 'b.ts', symbol: 'publicRouter', viaSymbol: 'rateLimit', line: 23, rank: 0.8 }],
    impactedEndpoints: ['GET /api/items'],
    factsByFile: { 'b.ts': { endpoints: ['GET /api/items'], crons: [] } },
    degraded: false,
    status: 'ok',
    message: '',
    endpoints: [
      { value: 'GET /api/items', file: 'b.ts', viaSymbol: 'rateLimit', viaFile: 'a.ts', depth: 0 },
    ],
    crons: [],
    callersBySymbol: {
      rateLimit: {
        rows: [{ file: 'b.ts', symbol: 'publicRouter', viaSymbol: 'rateLimit', line: 23, rank: 0.8 }],
        total: 1,
        truncated: false,
      },
    },
    coverage: {
      changedFiles: ['a.ts'],
      analyzedFiles: ['a.ts'],
      unsupportedFiles: [],
      filesWithoutRank: [],
      callersTruncated: false,
      indexerVersion: 2,
      lastIndexedSha: 'deadbeef',
    },
  };
}

describe('toBlastRadius', () => {
  it('maps an ok BlastResult into a wire-valid BlastRadius', () => {
    const radius = toBlastRadius(okResult(), 'deadbeef');
    expect(() => BlastRadius.parse(radius)).not.toThrow();
    expect(radius.status).toBe('ok');
    expect(radius.downstream).toHaveLength(1);
    expect(radius.downstream[0]!.symbol).toBe('rateLimit');
    expect(radius.downstream[0]!.endpoints_affected).toEqual([
      { value: 'GET /api/items', file: 'b.ts', via_symbol: 'rateLimit', via_file: 'a.ts', depth: 0 },
    ]);
    expect(radius.head_sha).toBe('deadbeef');
  });

  it('degraded status carries a non-empty message and empty arrays — never masks missing data', () => {
    const degraded: BlastResult = {
      changedSymbols: [],
      callers: [],
      impactedEndpoints: [],
      degraded: true,
      status: 'degraded',
      reason: 'no_index',
      message: 'This repository has not been indexed yet — run a resync.',
      endpoints: [],
      crons: [],
      callersBySymbol: {},
      coverage: {
        changedFiles: ['a.py'],
        analyzedFiles: [],
        unsupportedFiles: [],
        filesWithoutRank: [],
        callersTruncated: false,
        indexerVersion: null,
        lastIndexedSha: null,
      },
    };
    const radius = toBlastRadius(degraded, null);
    expect(() => BlastRadius.parse(radius)).not.toThrow();
    expect(radius.status).toBe('degraded');
    expect(radius.message.length).toBeGreaterThan(0);
    expect(radius.downstream).toEqual([]);
    expect(radius.changed_symbols).toEqual([]);
  });
});
