import { and, count, desc, eq, inArray, max, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { FindingRow, PullRow } from '../../db/rows.js';

/**
 * multi-agent data-access. Owns `multi_agent_runs` (the link row) and reads
 * the `agent_runs`/`reviews`/`findings` join it needs to build a
 * `MultiAgentRun` response. Workspace-scoped throughout — the service never
 * touches Drizzle directly (onion-architecture).
 */

export type MultiAgentRunRow = typeof t.multiAgentRuns.$inferSelect;

/** One `agent_runs` row + its review (if any) + its findings, for a single
 *  multi-agent-run — the raw material the service assembles into columns
 *  and feeds to `computeConflicts`. */
export interface RunWithFindings {
  run: typeof t.agentRuns.$inferSelect;
  agentName: string | null;
  review: typeof t.reviews.$inferSelect | undefined;
  findings: FindingRow[];
}

/** Last N `done` runs of one agent, for the pre-run estimate (D-4). */
export interface AgentHistoryRow {
  durationMs: number | null;
  costUsd: number | null;
}

/** One row of the multi-agent run history list (GET /multi-agent-runs). */
export interface MultiRunSummaryRow {
  id: string;
  prId: string;
  prNumber: number | null;
  prTitle: string | null;
  ranAt: Date;
  agentCount: number;
  totalCostUsd: number | null;
  totalDurationMs: number;
}

export class MultiAgentRepository {
  constructor(private db: Db) {}

  getPull(workspaceId: string, prId: string): Promise<PullRow | undefined> {
    return this.db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)))
      .then((rows) => rows[0]);
  }

  /** Create the `multi_agent_runs` link row. Returns the full row. */
  async createMultiAgentRun(workspaceId: string, prId: string): Promise<MultiAgentRunRow> {
    const [row] = await this.db.insert(t.multiAgentRuns).values({ workspaceId, prId }).returning();
    return row!;
  }

  /** Most recent multi-agent-run for a PR, or undefined if none exist yet. */
  async getLatestMultiRun(workspaceId: string, prId: string): Promise<MultiAgentRunRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.multiAgentRuns)
      .where(and(eq(t.multiAgentRuns.workspaceId, workspaceId), eq(t.multiAgentRuns.prId, prId)))
      .orderBy(desc(t.multiAgentRuns.ranAt))
      .limit(1);
    return row;
  }

  /** One specific multi-agent-run by id, workspace-scoped. */
  async getMultiRunById(workspaceId: string, multiRunId: string): Promise<MultiAgentRunRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.multiAgentRuns)
      .where(and(eq(t.multiAgentRuns.workspaceId, workspaceId), eq(t.multiAgentRuns.id, multiRunId)));
    return row;
  }

  /**
   * Every `agent_runs` row linked to this multi-agent-run, joined with the
   * agent's name, its review (if the run produced one), and that review's
   * findings. Workspace scoping happens one level up (the multi_agent_runs
   * row itself was already fetched workspace-scoped) — `agent_runs.multi_agent_run_id`
   * is the sole join key here.
   */
  async runsWithFindingsForMultiRun(multiRunId: string): Promise<RunWithFindings[]> {
    const runRows = await this.db
      .select({ run: t.agentRuns, agentName: t.agents.name })
      .from(t.agentRuns)
      .leftJoin(t.agents, eq(t.agents.id, t.agentRuns.agentId))
      .where(eq(t.agentRuns.multiAgentRunId, multiRunId));

    if (runRows.length === 0) return [];

    const runIds = runRows.map((r) => r.run.id);
    const reviewRows = await this.db
      .select()
      .from(t.reviews)
      .where(inArray(t.reviews.runId, runIds));
    const reviewsByRunId = new Map(reviewRows.map((r) => [r.runId, r]));

    const reviewIds = reviewRows.map((r) => r.id);
    const findingRows =
      reviewIds.length > 0
        ? await this.db.select().from(t.findings).where(inArray(t.findings.reviewId, reviewIds))
        : [];
    const findingsByReviewId = new Map<string, FindingRow[]>();
    for (const f of findingRows) {
      const bucket = findingsByReviewId.get(f.reviewId);
      if (bucket) bucket.push(f);
      else findingsByReviewId.set(f.reviewId, [f]);
    }

    return runRows.map(({ run, agentName }) => {
      const review = run.id ? reviewsByRunId.get(run.id) : undefined;
      const findings = review ? (findingsByReviewId.get(review.id) ?? []) : [];
      return { run, agentName, review, findings };
    });
  }

  /**
   * Every multi-agent-run in the workspace (newest first), joined with its
   * PR's number/title and aggregated over its `agent_runs` — agent_count
   * (COUNT), total_cost_usd (SUM, ignoring nulls), total_duration_ms (MAX).
   * Optionally filtered to a single PR for the PR-scoped history link.
   */
  async listMultiRuns(workspaceId: string, prId?: string): Promise<MultiRunSummaryRow[]> {
    const where = prId
      ? and(eq(t.multiAgentRuns.workspaceId, workspaceId), eq(t.multiAgentRuns.prId, prId))
      : eq(t.multiAgentRuns.workspaceId, workspaceId);

    const rows = await this.db
      .select({
        id: t.multiAgentRuns.id,
        prId: t.multiAgentRuns.prId,
        prNumber: t.pullRequests.number,
        prTitle: t.pullRequests.title,
        ranAt: t.multiAgentRuns.ranAt,
        agentCount: count(t.agentRuns.id),
        totalCostUsd: sql<number | null>`sum(${t.agentRuns.costUsd})`,
        totalDurationMs: max(t.agentRuns.durationMs),
      })
      .from(t.multiAgentRuns)
      .leftJoin(t.pullRequests, eq(t.pullRequests.id, t.multiAgentRuns.prId))
      .leftJoin(t.agentRuns, eq(t.agentRuns.multiAgentRunId, t.multiAgentRuns.id))
      .where(where)
      .groupBy(
        t.multiAgentRuns.id,
        t.multiAgentRuns.prId,
        t.multiAgentRuns.ranAt,
        t.pullRequests.number,
        t.pullRequests.title,
      )
      .orderBy(desc(t.multiAgentRuns.ranAt));

    return rows.map((r) => ({
      ...r,
      totalDurationMs: r.totalDurationMs ?? 0,
    }));
  }

  /**
   * Last N `done` runs of each given agent (newest first), for the pre-run
   * estimate (D-4, N=5). One query per agent — the caller passes a small,
   * user-selected set of agent ids, so N+1 is not a concern here.
   */
  async estimateForAgents(
    workspaceId: string,
    agentIds: string[],
    n = 5,
  ): Promise<Map<string, AgentHistoryRow[]>> {
    const result = new Map<string, AgentHistoryRow[]>();
    for (const agentId of agentIds) {
      const rows = await this.db
        .select({ durationMs: t.agentRuns.durationMs, costUsd: t.agentRuns.costUsd })
        .from(t.agentRuns)
        .where(
          and(
            eq(t.agentRuns.workspaceId, workspaceId),
            eq(t.agentRuns.agentId, agentId),
            eq(t.agentRuns.status, 'done'),
          ),
        )
        .orderBy(desc(t.agentRuns.ranAt))
        .limit(n);
      result.set(agentId, rows);
    }
    return result;
  }
}
