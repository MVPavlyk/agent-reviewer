import { and, desc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * evals module data-access. The ONLY layer touching the DB for the eval
 * pipeline. Reads across `findings` → `reviews` → `pull_requests` to resolve
 * a finding's workspace/agent/patch context (Крок 8), and owns `eval_cases` /
 * `eval_run_batches` / `eval_runs` (Кроки 8-11).
 */

export type FindingRow = typeof t.findings.$inferSelect;
export type ReviewRow = typeof t.reviews.$inferSelect;
export type PullRow = typeof t.pullRequests.$inferSelect;
export type PrFileRow = typeof t.prFiles.$inferSelect;
export type EvalCaseRow = typeof t.evalCases.$inferSelect;
export type EvalRunBatchRow = typeof t.evalRunBatches.$inferSelect;
export type EvalRunRow = typeof t.evalRuns.$inferSelect;
export type AgentRow = typeof t.agents.$inferSelect;

/** A finding joined with its review and PR — enough to check workspace + build a case. */
export interface FindingContext {
  finding: FindingRow;
  review: ReviewRow;
  pull: PullRow;
}

export class EvalsRepository {
  constructor(private db: Db) {}

  // ---- finding → review → PR context (for creating a case from a finding) --

  async findingContext(findingId: string): Promise<FindingContext | undefined> {
    const [row] = await this.db
      .select({ finding: t.findings, review: t.reviews, pull: t.pullRequests })
      .from(t.findings)
      .innerJoin(t.reviews, eq(t.findings.reviewId, t.reviews.id))
      .innerJoin(t.pullRequests, eq(t.reviews.prId, t.pullRequests.id))
      .where(eq(t.findings.id, findingId));
    return row;
  }

  /** The persisted patch for one file of a PR (undefined if the file isn't tracked). */
  async prFileByPath(prId: string, path: string): Promise<PrFileRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.prFiles)
      .where(and(eq(t.prFiles.prId, prId), eq(t.prFiles.path, path)));
    return row;
  }

  // ---- eval_cases -----------------------------------------------------------

  /**
   * All eval cases for an owner (agent/skill) whose `input_meta.source_finding`
   * references `findingId` — used for the create-case idempotency check
   * (AC-17). Filtered in application code: the dataset per owner is small and
   * this avoids a JSONB containment query for a single narrow lookup.
   */
  async findCaseBySourceFinding(
    workspaceId: string,
    ownerKind: 'agent' | 'skill',
    ownerId: string,
    findingId: string,
  ): Promise<EvalCaseRow | undefined> {
    const rows = await this.db
      .select()
      .from(t.evalCases)
      .where(
        and(
          eq(t.evalCases.workspaceId, workspaceId),
          eq(t.evalCases.ownerKind, ownerKind),
          eq(t.evalCases.ownerId, ownerId),
        ),
      );
    return rows.find((r) => {
      const meta = r.inputMeta as { source_finding?: { finding_id?: string } } | null;
      return meta?.source_finding?.finding_id === findingId;
    });
  }

  /** Existing case names for an owner, for slug-collision suffixing (OQ-4). */
  async caseNamesForOwner(
    workspaceId: string,
    ownerKind: 'agent' | 'skill',
    ownerId: string,
  ): Promise<string[]> {
    const rows = await this.db
      .select({ name: t.evalCases.name })
      .from(t.evalCases)
      .where(
        and(
          eq(t.evalCases.workspaceId, workspaceId),
          eq(t.evalCases.ownerKind, ownerKind),
          eq(t.evalCases.ownerId, ownerId),
        ),
      );
    return rows.map((r) => r.name);
  }

  async insertCase(values: typeof t.evalCases.$inferInsert): Promise<EvalCaseRow> {
    const [row] = await this.db.insert(t.evalCases).values(values).returning();
    return row!;
  }

  async allCasesForOwner(
    workspaceId: string,
    ownerKind: 'agent' | 'skill',
    ownerId: string,
  ): Promise<EvalCaseRow[]> {
    return this.db
      .select()
      .from(t.evalCases)
      .where(
        and(
          eq(t.evalCases.workspaceId, workspaceId),
          eq(t.evalCases.ownerKind, ownerKind),
          eq(t.evalCases.ownerId, ownerId),
        ),
      );
  }

  async casesByIds(workspaceId: string, ids: string[]): Promise<EvalCaseRow[]> {
    if (ids.length === 0) return [];
    return this.db
      .select()
      .from(t.evalCases)
      .where(and(eq(t.evalCases.workspaceId, workspaceId), inArray(t.evalCases.id, ids)));
  }

  // ---- agent (snapshot for a batch) -----------------------------------------

  async getAgent(workspaceId: string, agentId: string): Promise<AgentRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, agentId)));
    return row;
  }

  // ---- eval_run_batches -------------------------------------------------------

  async insertBatch(values: typeof t.evalRunBatches.$inferInsert): Promise<EvalRunBatchRow> {
    const [row] = await this.db.insert(t.evalRunBatches).values(values).returning();
    return row!;
  }

  async getBatch(workspaceId: string, batchId: string): Promise<EvalRunBatchRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.evalRunBatches)
      .where(and(eq(t.evalRunBatches.workspaceId, workspaceId), eq(t.evalRunBatches.id, batchId)));
    return row;
  }

  async listBatchesForAgent(workspaceId: string, agentId: string): Promise<EvalRunBatchRow[]> {
    return this.db
      .select()
      .from(t.evalRunBatches)
      .where(and(eq(t.evalRunBatches.workspaceId, workspaceId), eq(t.evalRunBatches.agentId, agentId)))
      .orderBy(desc(t.evalRunBatches.startedAt));
  }

  async listBatchesForWorkspace(workspaceId: string): Promise<EvalRunBatchRow[]> {
    return this.db
      .select()
      .from(t.evalRunBatches)
      .where(eq(t.evalRunBatches.workspaceId, workspaceId))
      .orderBy(desc(t.evalRunBatches.startedAt));
  }

  async updateBatch(
    workspaceId: string,
    batchId: string,
    values: Partial<typeof t.evalRunBatches.$inferInsert>,
  ): Promise<EvalRunBatchRow | undefined> {
    const [row] = await this.db
      .update(t.evalRunBatches)
      .set(values)
      .where(and(eq(t.evalRunBatches.workspaceId, workspaceId), eq(t.evalRunBatches.id, batchId)))
      .returning();
    return row;
  }

  // ---- eval_runs --------------------------------------------------------------

  async insertRun(values: typeof t.evalRuns.$inferInsert): Promise<EvalRunRow> {
    const [row] = await this.db.insert(t.evalRuns).values(values).returning();
    return row!;
  }

  /** Updates a run row already written mid-batch (Крок 10 progress fix) with its final score. */
  async updateRun(runId: string, values: Partial<typeof t.evalRuns.$inferInsert>): Promise<EvalRunRow | undefined> {
    const [row] = await this.db.update(t.evalRuns).set(values).where(eq(t.evalRuns.id, runId)).returning();
    return row;
  }

  async runsForBatch(batchId: string): Promise<EvalRunRow[]> {
    return this.db.select().from(t.evalRuns).where(eq(t.evalRuns.batchId, batchId));
  }

  async runsForBatches(batchIds: string[]): Promise<EvalRunRow[]> {
    if (batchIds.length === 0) return [];
    return this.db.select().from(t.evalRuns).where(inArray(t.evalRuns.batchId, batchIds));
  }

  /** Most recent run per case (across all batches) — for the case-list read model. */
  async lastRunsForCases(caseIds: string[]): Promise<Map<string, EvalRunRow>> {
    if (caseIds.length === 0) return new Map();
    const rows = await this.db.select().from(t.evalRuns).where(inArray(t.evalRuns.caseId, caseIds));
    const map = new Map<string, EvalRunRow>();
    for (const r of rows) {
      const existing = map.get(r.caseId);
      if (!existing || r.ranAt > existing.ranAt) map.set(r.caseId, r);
    }
    return map;
  }
}
