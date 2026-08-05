import type { Skill, SkillSource, SkillType, SkillVersion } from '@devdigest/shared';
import type { SkillRow, SkillRowWithStats, SkillVersionRow } from './repository.js';

/**
 * Pure helpers for the skills module — DB row ⇄ DTO mapping and the
 * body-change-bumps-version rule. No I/O. Mirrors `modules/agents/helpers.ts`.
 */

/** Map a persisted skill row (with its joined usage stats) to the public
 *  `Skill` DTO. */
export function toSkillDto(row: SkillRowWithStats): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type as SkillType,
    source: row.source as SkillSource,
    body: row.body,
    enabled: row.enabled,
    version: row.version,
    evidence_files: row.evidenceFiles ?? null,
    agents_count: row.agentsCount,
    pull_rate: row.pullRate,
  };
}

/** Map a persisted skill_versions row to the public `SkillVersion` DTO. */
export function toSkillVersionDto(row: SkillVersionRow): SkillVersion {
  return {
    skill_id: row.skillId,
    version: row.version,
    body: row.body,
    change_summary: row.changeSummary ?? null,
    created_at: row.createdAt.toISOString(),
  };
}

/**
 * True when a patch changes `body` relative to the existing row — a body
 * change bumps the version and snapshots `skill_versions`; a name/description
 * -only edit must not.
 */
export function isBodyChange(
  existing: Pick<SkillRow, 'body'>,
  patch: { body?: string },
): boolean {
  return patch.body !== undefined && patch.body !== existing.body;
}
