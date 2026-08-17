/**
 * repo-intel — pure blast-radius helpers (no DB/fs/env). Split out of
 * service.ts so the per-symbol clamp and status derivation are unit-testable
 * without Postgres, and so any facade consumer (not just HTTP) gets the same
 * clamp/degradation behaviour.
 */
import type { BlastCallerRow, BlastStatus, DegradedReason } from './types.js';

export interface ClampedCallers {
  bySymbol: Record<string, { rows: BlastCallerRow[]; total: number; truncated: boolean }>;
  flat: BlastCallerRow[];
  anyTruncated: boolean;
}

/**
 * Groups callers by `viaSymbol`, sorts each group deterministically
 * (rank DESC, then file ASC / line ASC as a tiebreaker), and clamps each
 * group independently to `limit` rows — R2. A global `slice(0, limit)`
 * starves symbols that sort after a "hot" symbol's 20+ callers; this doesn't.
 */
export function clampCallersPerSymbol(rows: BlastCallerRow[], limit: number): ClampedCallers {
  const grouped = new Map<string, BlastCallerRow[]>();
  for (const row of rows) {
    const arr = grouped.get(row.viaSymbol);
    if (arr) arr.push(row);
    else grouped.set(row.viaSymbol, [row]);
  }

  const bySymbol: ClampedCallers['bySymbol'] = {};
  const flat: BlastCallerRow[] = [];
  let anyTruncated = false;

  for (const [symbol, group] of grouped) {
    const sorted = [...group].sort((a, b) => {
      if (b.rank !== a.rank) return b.rank - a.rank;
      if (a.file !== b.file) return a.file < b.file ? -1 : 1;
      return a.line - b.line;
    });
    const truncated = sorted.length > limit;
    const clamped = sorted.slice(0, limit);
    bySymbol[symbol] = { rows: clamped, total: sorted.length, truncated };
    flat.push(...clamped);
    if (truncated) anyTruncated = true;
  }

  return { bySymbol, flat, anyTruncated };
}

/** Splits `paths` into those with a supported extension and those without — R9. */
export function partitionBySupportedExt(
  paths: string[],
  supportedExt: readonly string[],
): { supported: string[]; unsupported: string[] } {
  const supported: string[] = [];
  const unsupported: string[] = [];
  for (const p of paths) {
    const dot = p.lastIndexOf('.');
    const ext = dot >= 0 ? p.slice(dot).toLowerCase() : '';
    if (supportedExt.includes(ext)) supported.push(p);
    else unsupported.push(p);
  }
  return { supported, unsupported };
}

export interface DeriveBlastStatusInput {
  repoIntelEnabled: boolean;
  hasIndexRow: boolean;
  indexStatus: 'full' | 'partial' | 'degraded' | 'failed' | null;
  indexerVersionMatches: boolean;
  changedFilesCount: number;
  unsupportedFilesCount: number;
  /** True once we know at least one changed file is index-supported but the
   *  index has zero symbols for the whole changed set. */
  noSymbolsForSupportedFiles: boolean;
  /** True when every caller file we needed a rank for came back without one. */
  rankMissingForAllCallers: boolean;
  anyTruncated: boolean;
}

export interface DeriveBlastStatusResult {
  status: BlastStatus;
  reason: DegradedReason | null;
  message: string;
}

/**
 * Single source of truth for status/reason/message — the degradation table
 * from the plan (§S3), checked top to bottom, first match wins.
 */
export function deriveBlastStatus(input: DeriveBlastStatusInput): DeriveBlastStatusResult {
  const {
    repoIntelEnabled,
    hasIndexRow,
    indexStatus,
    indexerVersionMatches,
    changedFilesCount,
    unsupportedFilesCount,
    noSymbolsForSupportedFiles,
    rankMissingForAllCallers,
    anyTruncated,
  } = input;

  if (!repoIntelEnabled) {
    return { status: 'degraded', reason: 'flag_off', message: 'Repo intelligence is disabled.' };
  }
  if (!hasIndexRow) {
    return {
      status: 'degraded',
      reason: 'no_index',
      message: 'This repository has not been indexed yet — run a resync.',
    };
  }
  if (indexStatus === 'failed') {
    return { status: 'degraded', reason: 'index_failed', message: 'The last index run failed.' };
  }
  if (!indexerVersionMatches) {
    return {
      status: 'degraded',
      reason: 'index_stale',
      message: 'The index was built with an older indexer version — a full reindex is required.',
    };
  }
  if (changedFilesCount > 0 && unsupportedFilesCount === changedFilesCount) {
    return {
      status: 'degraded',
      reason: 'unsupported_files',
      message: `${unsupportedFilesCount} of ${changedFilesCount} changed files are not covered by the indexer (only ts/tsx/js/jsx/mjs/cjs).`,
    };
  }
  if (noSymbolsForSupportedFiles) {
    return {
      status: 'degraded',
      reason: 'no_symbols',
      message:
        'No symbols found in the index for the changed files (file may be outside the index or paths don’t match).',
    };
  }
  if (rankMissingForAllCallers) {
    return {
      status: 'partial',
      reason: 'rank_missing',
      message: 'File rank is unavailable — callers are not sorted by importance.',
    };
  }
  if (indexStatus === 'partial') {
    return {
      status: 'partial',
      reason: 'index_partial',
      message: 'The index is incomplete (5000-file limit or time budget).',
    };
  }
  if (unsupportedFilesCount > 0) {
    return {
      status: 'partial',
      reason: 'unsupported_files',
      message: `${unsupportedFilesCount} of ${changedFilesCount} changed files are not covered by the indexer.`,
    };
  }
  if (anyTruncated) {
    return {
      status: 'partial',
      reason: 'index_partial',
      message: 'The caller list was truncated to 20 per symbol.',
    };
  }
  return { status: 'ok', reason: null, message: '' };
}
