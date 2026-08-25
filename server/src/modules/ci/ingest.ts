import type { CiFailOn, CiResultArtifact } from '@devdigest/shared';

/**
 * A4 — pure domain logic for ingest (Pass 6, ADDENDUM v2 decision 2). Free of
 * Fastify/Drizzle types (onion-architecture) so it's testable without a
 * request or a DB — `CiService.ingestResult` is the only caller.
 */

/** Extract the raw bearer token from an `Authorization` header, or `null`
 *  when absent/malformed. Never throws — the caller decides how to react. */
export function extractBearerToken(authorizationHeader: string | undefined): string | null {
  if (!authorizationHeader) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(authorizationHeader.trim());
  return match?.[1] ?? null;
}

/** A commit SHA is well-formed when it's 7-40 lowercase/uppercase hex chars
 *  (short or full SHA-1) — matches what `${{ github.sha }}` always emits. */
export function isWellFormedCommitSha(sha: string | undefined): sha is string {
  return typeof sha === 'string' && /^[0-9a-f]{7,40}$/i.test(sha);
}

/**
 * How many findings trip the agent's CI gate, computed from the artifact's
 * severity counts (not a `Finding[]`, since the artifact only carries
 * aggregates) — same threshold semantics as reviewer-core's `countBlockers`
 * (`SEV_RANK`/`FAIL_ON_MIN_RANK`), reimplemented here against counts because
 * this module has no dependency on reviewer-core.
 */
export function deriveBlockers(artifact: CiResultArtifact, failOn: CiFailOn): number {
  const critical = artifact.critical ?? 0;
  const warning = artifact.warning ?? 0;
  const suggestion = artifact.suggestion ?? 0;
  switch (failOn) {
    case 'never':
      return 0;
    case 'critical':
      return critical;
    case 'warning':
      return critical + warning;
    case 'any':
      return critical + warning + suggestion;
    default:
      return 0;
  }
}

/** `ci_runs.status` (`CiRunStatus`): a zero-finding artifact is `no_findings`;
 *  anything else that reached ingest is `succeeded` (the artifact only exists
 *  because the runner produced one — a run that errored before producing
 *  `devdigest-result.json` never reaches this endpoint at all). */
export function deriveRunStatus(artifact: CiResultArtifact): 'succeeded' | 'no_findings' {
  return artifact.findings_count === 0 ? 'no_findings' : 'succeeded';
}

/** `ci_runs.verdict` (`Verdict`) — deterministic from the gate, matching the
 *  server's existing "verdict from severities, not the model" convention
 *  (`reviewer-core/src/output/to-review.ts`). */
export function deriveVerdict(
  blockers: number,
  findingsCount: number,
): 'request_changes' | 'comment' | 'approve' {
  if (blockers > 0) return 'request_changes';
  if (findingsCount > 0) return 'comment';
  return 'approve';
}
