import { and, count, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { SkillSource, SkillType } from '@devdigest/shared';
import { INITIAL_SKILL_VERSION } from './constants.js';
import { isBodyChange } from './helpers.js';
import { apportionCostByCategory, type CategoryBreakdownRow } from './stats.js';

/**
 * A1 — skills data-access. Owns `skills`, `skill_versions`, and `run_skills`
 * (the run-attribution join, written by the reviews module through
 * `container.skillsRepo`). Workspace-scoped throughout. Mirrors
 * `modules/agents/repository.ts`.
 */

import type { RunSkillRow, SkillRow, SkillVersionRow } from '../../db/rows.js';
export type { RunSkillRow, SkillRow, SkillVersionRow };

/** A skill row plus its list-cheap, all-time usage stats (docs/specs/skills.md E7). */
export type SkillRowWithStats = SkillRow & {
  agentsCount: number;
  pullRate: number;
  acceptRate: number;
};

export interface SkillStatsResult {
  agentsCount: number;
  pullRate: number;
  acceptRate: number;
  findingsByCategory: CategoryBreakdownRow[];
  totalCostUsd: number;
  windowDays: number;
}

export interface InsertSkill {
  workspaceId: string;
  name: string;
  description: string;
  type: SkillType;
  source: SkillSource;
  body: string;
  enabled?: boolean;
  evidenceFiles?: string[];
}

export interface UpdateSkill {
  name?: string;
  description?: string;
  type?: SkillType;
  source?: SkillSource;
  body?: string;
  enabled?: boolean;
  evidenceFiles?: string[];
  /** Free-text summary of the body change, snapshotted into skill_versions
   *  only when `body` actually changed (E3). Ignored otherwise. */
  changeSummary?: string | null;
}

export class SkillsRepository {
  constructor(private db: Db) {}

  async list(workspaceId: string): Promise<SkillRowWithStats[]> {
    const rows = await this.db.select().from(t.skills).where(eq(t.skills.workspaceId, workspaceId));
    return this.withStats(rows);
  }

  async getById(workspaceId: string, id: string): Promise<SkillRowWithStats | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)));
    if (!row) return undefined;
    const [withStats] = await this.withStats([row]);
    return withStats;
  }

  /** Delete a skill (scoped to workspace). skill_versions and agent_skills
   *  links cascade. Returns false if no such skill existed in the workspace. */
  async deleteById(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning({ id: t.skills.id });
    return rows.length > 0;
  }

  /** Insert a skill AND record version 1 in skill_versions (immutable snapshot). */
  async insert(values: InsertSkill): Promise<SkillRow> {
    const [row] = await this.db
      .insert(t.skills)
      .values({
        workspaceId: values.workspaceId,
        name: values.name,
        description: values.description,
        type: values.type,
        source: values.source,
        body: values.body,
        enabled: values.enabled ?? true,
        version: INITIAL_SKILL_VERSION,
        evidenceFiles: values.evidenceFiles ?? null,
      })
      .returning();
    await this.snapshotVersion(row!, INITIAL_SKILL_VERSION);
    return row!;
  }

  /**
   * Update a skill. A `body` change bumps the version and snapshots the new
   * body into skill_versions; a name/description-only edit does not.
   */
  async update(workspaceId: string, id: string, patch: UpdateSkill): Promise<SkillRow | undefined> {
    const existing = await this.getById(workspaceId, id);
    if (!existing) return undefined;

    const bodyChanged = isBodyChange(existing, patch);
    const nextVersion = bodyChanged ? existing.version + 1 : existing.version;

    const [row] = await this.db
      .update(t.skills)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.type !== undefined ? { type: patch.type } : {}),
        ...(patch.source !== undefined ? { source: patch.source } : {}),
        ...(patch.body !== undefined ? { body: patch.body } : {}),
        ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
        ...(patch.evidenceFiles !== undefined ? { evidenceFiles: patch.evidenceFiles } : {}),
        ...(bodyChanged ? { version: nextVersion } : {}),
      })
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning();

    if (bodyChanged && row) {
      await this.snapshotVersion(row, nextVersion, patch.changeSummary ?? null);
    }
    return row;
  }

  private async snapshotVersion(
    row: SkillRow,
    version: number,
    changeSummary: string | null = null,
  ): Promise<void> {
    await this.db
      .insert(t.skillVersions)
      .values({ skillId: row.id, version, body: row.body, changeSummary })
      .onConflictDoNothing();
  }

  // ---- skill_versions (immutable body snapshots) ---------------------------

  /** All body snapshots for a skill, newest version first. */
  async listVersions(skillId: string): Promise<SkillVersionRow[]> {
    return this.db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, skillId))
      .orderBy(desc(t.skillVersions.version));
  }

  /** A single body snapshot, or undefined if that version was never recorded. */
  async getVersion(skillId: string, version: number): Promise<SkillVersionRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skillVersions)
      .where(and(eq(t.skillVersions.skillId, skillId), eq(t.skillVersions.version, version)));
    return row;
  }

  // ---- run_skills (attribution join, written by the reviews module) -------

  /**
   * Persist which skills (and which skill VERSION) were active on a run —
   * called once, right after `ReviewRunExecutor` resolves `linkedSkills`
   * (docs/specs/skills.md decision E6). Idempotent: a retried write for the
   * same (run, skill) is a no-op, not a duplicate.
   */
  async insertRunSkills(
    runId: string,
    links: { skillId: string; skillVersion: number }[],
  ): Promise<void> {
    if (links.length === 0) return;
    await this.db
      .insert(t.runSkills)
      .values(links.map((l) => ({ runId, skillId: l.skillId, skillVersion: l.skillVersion })))
      .onConflictDoNothing();
  }

  // ---- Stats (docs/specs/skills.md Extension — detail tabs + Stats) -------

  /**
   * Findings-by-category breakdown + total cost for one skill, over the last
   * `windowDays` (E5 — fixed window, no date-range picker). Attribution is
   * APPROXIMATE: findings are never LLM-tagged to a specific skill, so a
   * run's cost is split evenly across its own findings, then every finding
   * whose run had this skill attached (via `run_skills`) counts as "this
   * skill's" (E4). `agents_count`/`pull_rate`/`accept_rate` stay all-time,
   * reusing the same aggregate as `list`/`getById`.
   */
  async getStats(
    workspaceId: string,
    skillId: string,
    windowDays: number,
  ): Promise<SkillStatsResult | undefined> {
    const skill = await this.getById(workspaceId, skillId);
    if (!skill) return undefined;

    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
    // One row per finding attributed to this skill — the cost SPLIT itself is
    // pure JS (apportionCostByCategory), not SQL, so it's unit-testable
    // without a database (see skills-stats.test.ts).
    const rows = await this.db
      .select({
        category: t.findings.category,
        runCostUsd: t.agentRuns.costUsd,
        runFindingsCount: t.agentRuns.findingsCount,
      })
      .from(t.runSkills)
      .innerJoin(t.reviews, eq(t.reviews.runId, t.runSkills.runId))
      .innerJoin(t.findings, eq(t.findings.reviewId, t.reviews.id))
      .innerJoin(t.agentRuns, eq(t.agentRuns.id, t.runSkills.runId))
      .where(and(eq(t.runSkills.skillId, skillId), gte(t.reviews.createdAt, since)));

    const { findingsByCategory, totalCostUsd } = apportionCostByCategory(
      rows.map((r) => ({
        category: r.category as CategoryBreakdownRow['category'],
        runCostUsd: r.runCostUsd,
        runFindingsCount: r.runFindingsCount,
      })),
    );

    return {
      agentsCount: skill.agentsCount,
      pullRate: skill.pullRate,
      acceptRate: skill.acceptRate,
      findingsByCategory,
      totalCostUsd,
      windowDays,
    };
  }

  // ---- Stats aggregation (private) -----------------------------------------

  /** Attach all-time agents_count/pull_rate/accept_rate to each row. Batched
   *  IN-queries + JS merge — same shape as `costByPr`/`latestReviewScoreByPr`
   *  in `modules/pulls/repository.ts`, not one giant join. */
  private async withStats(rows: SkillRow[]): Promise<SkillRowWithStats[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const [agentsCount, pullRate, acceptRate] = await Promise.all([
      this.agentsCountBySkill(ids),
      this.pullRateBySkill(ids),
      this.acceptRateBySkill(ids),
    ]);
    return rows.map((row) => ({
      ...row,
      agentsCount: agentsCount.get(row.id) ?? 0,
      pullRate: pullRate.get(row.id) ?? 0,
      acceptRate: acceptRate.get(row.id) ?? 0,
    }));
  }

  /** Distinct agents currently linked to each skill. */
  private async agentsCountBySkill(skillIds: string[]): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    const rows = await this.db
      .select({ skillId: t.agentSkills.skillId, n: count(t.agentSkills.agentId) })
      .from(t.agentSkills)
      .where(inArray(t.agentSkills.skillId, skillIds))
      .groupBy(t.agentSkills.skillId);
    for (const r of rows) out.set(r.skillId, Number(r.n));
    return out;
  }

  /**
   * Fraction of agent_runs — by agents CURRENTLY linked to the skill, run
   * SINCE the skill was created — where the skill was actually pulled into
   * the prompt (a `run_skills` row exists, i.e. it was enabled at run time
   * per decision 1). Approximate on two axes: `agent_skills` has no history
   * (evaluated against today's links, not whatever was linked at the time of
   * each run), and `skills.created_at` is a floor, not the actual link date
   * (a skill can be linked well after it was created) — but it's a real
   * improvement over counting an agent's ENTIRE run history, which made a
   * freshly-linked skill's pull_rate look artificially low.
   */
  private async pullRateBySkill(skillIds: string[]): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    const [totalRows, includedRows] = await Promise.all([
      this.db
        .select({ skillId: t.agentSkills.skillId, n: count(t.agentRuns.id) })
        .from(t.agentSkills)
        .innerJoin(t.skills, eq(t.skills.id, t.agentSkills.skillId))
        .innerJoin(
          t.agentRuns,
          and(
            eq(t.agentRuns.agentId, t.agentSkills.agentId),
            gte(t.agentRuns.ranAt, t.skills.createdAt),
          ),
        )
        .where(inArray(t.agentSkills.skillId, skillIds))
        .groupBy(t.agentSkills.skillId),
      this.db
        .select({ skillId: t.runSkills.skillId, n: count(t.runSkills.runId) })
        .from(t.runSkills)
        .where(inArray(t.runSkills.skillId, skillIds))
        .groupBy(t.runSkills.skillId),
    ]);
    const totals = new Map(totalRows.map((r) => [r.skillId, Number(r.n)]));
    const included = new Map(includedRows.map((r) => [r.skillId, Number(r.n)]));
    for (const id of skillIds) {
      const total = totals.get(id) ?? 0;
      out.set(id, total === 0 ? 0 : (included.get(id) ?? 0) / total);
    }
    return out;
  }

  /** accepted / (accepted + dismissed) across findings attributed to the
   *  skill via `run_skills`, all-time. Same definition as `AgentPerfRow.accept_rate`. */
  private async acceptRateBySkill(skillIds: string[]): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    const rows = await this.db
      .select({
        skillId: t.runSkills.skillId,
        accepted: sql<string>`count(*) filter (where ${t.findings.acceptedAt} is not null)`,
        dismissed: sql<string>`count(*) filter (where ${t.findings.dismissedAt} is not null)`,
      })
      .from(t.runSkills)
      .innerJoin(t.reviews, eq(t.reviews.runId, t.runSkills.runId))
      .innerJoin(t.findings, eq(t.findings.reviewId, t.reviews.id))
      .where(inArray(t.runSkills.skillId, skillIds))
      .groupBy(t.runSkills.skillId);
    for (const r of rows) {
      const accepted = Number(r.accepted);
      const dismissed = Number(r.dismissed);
      const denom = accepted + dismissed;
      out.set(r.skillId, denom === 0 ? 0 : accepted / denom);
    }
    return out;
  }
}
