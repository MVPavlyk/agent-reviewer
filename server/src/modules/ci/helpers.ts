import type { CiInstallation, CiRun } from '@devdigest/shared';
import type { CiInstallationRow, CiRunRow } from './repository.js';

/** Row → API DTO for `ci_installations` (mirrors `CiInstallation`). */
export function toCiInstallationDto(row: CiInstallationRow): CiInstallation {
  return {
    id: row.id,
    agent_id: row.agentId,
    repo: row.repo,
    target_type: row.targetType,
    installed_at: row.installedAt.toISOString(),
    workflow_version: row.workflowVersion,
    pr_url: row.prUrl,
  };
}

/** Row → API DTO for `ci_runs` (mirrors `CiRun`). READ-ONLY row, never written by this module. */
export function toCiRunDto(
  row: CiRunRow & { agentName?: string | null; agentId?: string | null; repo?: string | null },
): CiRun {
  return {
    id: row.id,
    ci_installation_id: row.ciInstallationId,
    repo: row.repo ?? null,
    pr_number: row.prNumber,
    ran_at: row.ranAt ? row.ranAt.toISOString() : null,
    status: row.status,
    findings_count: row.findingsCount,
    cost_usd: row.costUsd,
    github_url: row.githubUrl,
    source: row.source,
    agent: row.agentName ?? null,
    agent_id: row.agentId ?? null,
    verdict: row.verdict as CiRun['verdict'],
    duration_ms: row.durationMs,
  };
}
