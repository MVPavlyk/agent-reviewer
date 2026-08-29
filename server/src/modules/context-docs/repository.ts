import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * context-docs data-access (SPEC-01 AC-11..AC-19, AC-34, 30-plan.md Крок 5).
 * Owns `agent_context_docs`, `skill_context_docs`, `run_context_docs`.
 * Mirrors `modules/agents/repository.ts`'s `setSkills`/`linkSkill` shape for
 * the replace-set semantics and the cross-workspace validation pattern
 * (`server/INSIGHTS.md` 2026-08-03: validate on the WRITE path, with a plain
 * select inside this same repository — never trust an id from the route
 * alone).
 */

export type AgentContextDocRow = typeof t.agentContextDocs.$inferSelect;
export type SkillContextDocRow = typeof t.skillContextDocs.$inferSelect;
export type RunContextDocRow = typeof t.runContextDocs.$inferSelect;

export interface InsertRunContextDoc {
  path: string;
  contentHash: string | null;
  source: 'agent' | 'skill';
}

export class ContextDocsRepository {
  constructor(private db: Db) {}

  // ---- reads -----------------------------------------------------------
  //
  // Deliberately workspace-UNscoped: the one caller that needs a read at run
  // time (`ReviewRunExecutor`) already resolved `agentId`/`skillId` from a
  // trusted source (the agent the review is running as). The route handlers
  // that expose these reads over HTTP (Крок 6) check ownership themselves,
  // via `container.agentsRepo`/`container.skillsRepo`, before calling in.

  /** Documents attached directly to an agent, in `order` ascending (AC-12). */
  async listForAgent(agentId: string): Promise<AgentContextDocRow[]> {
    return this.db
      .select()
      .from(t.agentContextDocs)
      .where(eq(t.agentContextDocs.agentId, agentId))
      .orderBy(asc(t.agentContextDocs.order));
  }

  /** Documents attached to a skill, in `order` ascending (AC-13). */
  async listForSkill(skillId: string): Promise<SkillContextDocRow[]> {
    return this.db
      .select()
      .from(t.skillContextDocs)
      .where(eq(t.skillContextDocs.skillId, skillId))
      .orderBy(asc(t.skillContextDocs.order));
  }

  // ---- writes ------------------------------------------------------------

  /**
   * Replace the full set of paths attached to an agent, assigning
   * `order = index` (AC-12). Workspace-scoped: returns `null` when `agentId`
   * doesn't belong to `workspaceId` — the route maps that to 404 (AC-17).
   * Existence of each path on disk is deliberately NOT checked (AC-19).
   */
  async setForAgent(
    workspaceId: string,
    agentId: string,
    paths: string[],
  ): Promise<AgentContextDocRow[] | null> {
    const owns = await this.agentBelongsToWorkspace(workspaceId, agentId);
    if (!owns) return null;
    const deduped = dedupePaths(paths);
    await this.db.transaction(async (tx) => {
      await tx.delete(t.agentContextDocs).where(eq(t.agentContextDocs.agentId, agentId));
      if (deduped.length === 0) return;
      await tx
        .insert(t.agentContextDocs)
        .values(deduped.map((path, i) => ({ agentId, path, order: i })));
    });
    return this.listForAgent(agentId);
  }

  /** Same as `setForAgent`, for a skill (AC-13, AC-17 mirrored). */
  async setForSkill(
    workspaceId: string,
    skillId: string,
    paths: string[],
  ): Promise<SkillContextDocRow[] | null> {
    const owns = await this.skillBelongsToWorkspace(workspaceId, skillId);
    if (!owns) return null;
    const deduped = dedupePaths(paths);
    await this.db.transaction(async (tx) => {
      await tx.delete(t.skillContextDocs).where(eq(t.skillContextDocs.skillId, skillId));
      if (deduped.length === 0) return;
      await tx
        .insert(t.skillContextDocs)
        .values(deduped.map((path, i) => ({ skillId, path, order: i })));
    });
    return this.listForSkill(skillId);
  }

  /**
   * For each of `paths`, how many DISTINCT agents in `workspaceId` would
   * pull it into a prompt — counting a direct agent attachment OR an
   * attachment via a skill the agent has enabled AND linked (AC-11). An
   * agent attached both ways counts once: both queries key on `agentId`, and
   * the two result sets are merged into one Set per path before counting.
   */
  async usedByAgents(workspaceId: string, paths: string[]): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (paths.length === 0) return out;

    const byPath = new Map<string, Set<string>>();

    const direct = await this.db
      .select({ agentId: t.agentContextDocs.agentId, path: t.agentContextDocs.path })
      .from(t.agentContextDocs)
      .innerJoin(t.agents, eq(t.agents.id, t.agentContextDocs.agentId))
      .where(and(eq(t.agents.workspaceId, workspaceId), inArray(t.agentContextDocs.path, paths)));

    const viaSkill = await this.db
      .select({ agentId: t.agentSkills.agentId, path: t.skillContextDocs.path })
      .from(t.skillContextDocs)
      .innerJoin(t.skills, eq(t.skills.id, t.skillContextDocs.skillId))
      .innerJoin(t.agentSkills, eq(t.agentSkills.skillId, t.skills.id))
      .innerJoin(t.agents, eq(t.agents.id, t.agentSkills.agentId))
      .where(
        and(
          eq(t.agents.workspaceId, workspaceId),
          eq(t.skills.enabled, true),
          inArray(t.skillContextDocs.path, paths),
        ),
      );

    for (const row of [...direct, ...viaSkill]) {
      const set = byPath.get(row.path) ?? new Set<string>();
      set.add(row.agentId);
      byPath.set(row.path, set);
    }
    for (const path of paths) out.set(path, byPath.get(path)?.size ?? 0);
    return out;
  }

  /**
   * Persist which context docs were actually read into a run's prompt
   * (AC-34) — the context-docs analogue of `SkillsRepository.insertRunSkills`.
   * Idempotent: a retried write for the same (run, path) is a no-op.
   */
  async insertRunContextDocs(runId: string, rows: InsertRunContextDoc[]): Promise<void> {
    if (rows.length === 0) return;
    await this.db
      .insert(t.runContextDocs)
      .values(rows.map((r) => ({ runId, path: r.path, contentHash: r.contentHash, source: r.source })))
      .onConflictDoNothing();
  }

  // ---- cross-workspace guards (write path only) ---------------------------

  private async agentBelongsToWorkspace(workspaceId: string, agentId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: t.agents.id })
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, agentId)));
    return !!row;
  }

  private async skillBelongsToWorkspace(workspaceId: string, skillId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: t.skills.id })
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, skillId)));
    return !!row;
  }
}

/** Preserve first occurrence + its position; a duplicate path in the input
 *  would otherwise violate the `(agent_id, path)` / `(skill_id, path)` PK. */
function dedupePaths(paths: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const path of paths) {
    if (seen.has(path)) continue;
    seen.add(path);
    out.push(path);
  }
  return out;
}
