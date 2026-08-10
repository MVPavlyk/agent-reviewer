import type { ConventionCandidate, ConventionScanSummary } from '@devdigest/shared';
import type { ConventionRow, ConventionScanRow } from './repository.js';

/**
 * Pure helpers for the conventions module — DB row ⇄ DTO mapping. No I/O.
 * Mirrors `modules/skills/helpers.ts`.
 */

export function toConventionDto(row: ConventionRow): ConventionCandidate {
  return {
    id: row.id,
    scan_id: row.scanId,
    title: row.title,
    rule: row.rule,
    evidence_path: row.evidencePath,
    start_line: row.startLine,
    end_line: row.endLine,
    evidence_snippet: row.evidenceSnippet,
    confidence: row.confidence,
    status: row.status as ConventionCandidate['status'],
    created_at: row.createdAt.toISOString(),
    decided_at: row.decidedAt ? row.decidedAt.toISOString() : null,
  };
}

export function toScanSummaryDto(row: ConventionScanRow): ConventionScanSummary {
  return {
    id: row.id,
    status: row.status as ConventionScanSummary['status'],
    sample_file_count: row.sampleFileCount,
    candidate_count: row.candidateCount,
    started_at: row.startedAt.toISOString(),
    finished_at: row.finishedAt ? row.finishedAt.toISOString() : null,
    error: row.error,
  };
}
