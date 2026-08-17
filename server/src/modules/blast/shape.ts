import type {
  BlastRadius,
  BlastReason,
  BlastRef as ApiBlastRef,
  DownstreamImpact,
} from '@devdigest/shared';
import type { BlastRef as CoreBlastRef, BlastResult } from '../repo-intel/types.js';

/**
 * Pure mapping from the internal facade shape (camelCase, keyed maps) to the
 * HTTP contract (snake_case, arrays) — the only place blast/ knows the wire
 * format. No I/O, no DB, no repo-intel schema knowledge.
 */
export function toBlastRadius(result: BlastResult, headSha: string | null): BlastRadius {
  const changed_symbols = result.changedSymbols.map((s) => ({
    name: s.name,
    file: s.file,
    kind: s.kind,
  }));

  const changedFileBySymbol = new Map(result.changedSymbols.map((s) => [s.name, s.file]));

  const downstream: DownstreamImpact[] = Object.entries(result.callersBySymbol)
    .map(([symbol, group]) => {
      const symbolFile = changedFileBySymbol.get(symbol);
      const belongsTo = (ref: CoreBlastRef) =>
        ref.viaSymbol === symbol || (ref.viaSymbol === null && ref.viaFile === symbolFile);
      return {
        symbol,
        callers: group.rows.map((c) => ({ name: c.symbol, file: c.file, line: c.line, rank: c.rank })),
        callers_total: group.total,
        callers_truncated: group.truncated,
        endpoints_affected: result.endpoints.filter(belongsTo).map(toApiRef),
        crons_affected: result.crons.filter(belongsTo).map(toApiRef),
      };
    })
    .sort((a, b) => b.callers_total - a.callers_total || a.symbol.localeCompare(b.symbol));

  return {
    changed_symbols,
    downstream,
    summary: buildSummary(result),
    status: result.status,
    reason: result.reason ?? null,
    message: result.message,
    coverage: {
      changed_files: result.coverage.changedFiles,
      analyzed_files: result.coverage.analyzedFiles,
      unsupported_files: result.coverage.unsupportedFiles,
      files_without_rank: result.coverage.filesWithoutRank,
      indexer_version: result.coverage.indexerVersion,
      last_indexed_sha: result.coverage.lastIndexedSha,
    },
    head_sha: headSha,
  };
}

/** Degraded `BlastRadius` for PR-level reasons that never reach the
 *  repo-intel facade at all (e.g. the diff hasn't been fetched yet) — kept
 *  here so blast/service.ts never hand-assembles the wire shape itself. */
export function emptyBlastRadius(headSha: string | null, reason: BlastReason, message: string): BlastRadius {
  return {
    changed_symbols: [],
    downstream: [],
    summary: '0 symbols, 0 callers, 0 endpoints, 0 crons',
    status: 'degraded',
    reason,
    message,
    coverage: {
      changed_files: [],
      analyzed_files: [],
      unsupported_files: [],
      files_without_rank: [],
      indexer_version: null,
      last_indexed_sha: null,
    },
    head_sha: headSha,
  };
}

function toApiRef(ref: CoreBlastRef): ApiBlastRef {
  return {
    value: ref.value,
    file: ref.file,
    via_symbol: ref.viaSymbol,
    via_file: ref.viaFile,
    depth: ref.depth,
  };
}

function buildSummary(result: BlastResult): string {
  const symbolCount = result.changedSymbols.length;
  const callerCount = result.callers.length;
  const endpointCount = new Set(result.endpoints.map((e) => e.value)).size;
  const cronCount = new Set(result.crons.map((c) => c.value)).size;
  return `${symbolCount} symbol${symbolCount === 1 ? '' : 's'}, ${callerCount} caller${callerCount === 1 ? '' : 's'}, ${endpointCount} endpoint${endpointCount === 1 ? '' : 's'}, ${cronCount} cron${cronCount === 1 ? '' : 's'}`;
}
