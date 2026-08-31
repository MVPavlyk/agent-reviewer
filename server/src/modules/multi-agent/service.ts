import type { Container } from '../../platform/container.js';
import type {
  AgentColumn,
  AgentEstimate,
  AgentEstimates,
  MultiAgentRun,
  MultiAgentRunSummary,
  Severity,
} from '@devdigest/shared';
import { AppError, NotFoundError } from '../../platform/errors.js';
import { MultiAgentRepository, type RunWithFindings } from './repository.js';
import { ReviewService } from '../reviews/service.js';
import { type Logger } from '../reviews/run-executor.js';
import { computeConflicts, type ConflictGroupingRun } from './conflict-grouping.js';
import { averageAgentHistory, aggregateEstimates } from './estimate.js';

/**
 * Multi-agent-run service (SPEC-05). Business logic only — no Fastify/Drizzle
 * types (onion-architecture). DB access goes exclusively through
 * `MultiAgentRepository`; the actual parallel fan-out is NOT reimplemented
 * here (N-2) — it reuses `ReviewService.runReview` → `ReviewRunExecutor.executeRuns`
 * verbatim, only threading `{ multiAgentRunId }` through.
 */
export class MultiAgentService {
  private repo: MultiAgentRepository;
  private reviewService: ReviewService;
  private agents: Container['agentsRepo'];

  constructor(private container: Container) {
    this.repo = new MultiAgentRepository(container.db);
    this.reviewService = new ReviewService(container);
    this.agents = container.agentsRepo;
  }

  /**
   * Start a multi-agent-run: validate every `agentId` belongs to the
   * workspace (AC-6 — all-or-nothing, no partial multi-agent-run on a bad
   * id), create the `multi_agent_runs` link row, then reuse
   * `ReviewService.runReview` (which itself creates the `agent_runs` rows
   * up-front and fires the background fan-out via `ReviewRunExecutor`).
   * Returns a `MultiAgentRun` in the `running` state — columns present, no
   * findings/verdicts yet, `conflicts: []` (nothing to group before any run
   * is `done`).
   */
  async startMultiRun(
    workspaceId: string,
    prId: string,
    agentIds: string[],
    logger?: Logger,
  ): Promise<MultiAgentRun> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    // Resolve + validate ALL agents before creating anything (AC-6).
    const targets = [];
    for (const agentId of agentIds) {
      const agent = await this.agents.getById(workspaceId, agentId);
      if (!agent) throw new AppError('invalid_agent_id', `Agent not found: ${agentId}`, 422);
      targets.push(agent);
    }

    const multiRun = await this.repo.createMultiAgentRun(workspaceId, prId);
    const { runs } = await this.reviewService.runReview(workspaceId, prId, targets, logger, {
      multiAgentRunId: multiRun.id,
    });

    const runsById = new Map(runs.map((r) => [r.agent_id, r]));
    const columns: AgentColumn[] = targets.map((agent) => ({
      run_id: runsById.get(agent.id)?.run_id ?? '',
      agent_id: agent.id,
      agent_name: agent.name,
      provider: agent.provider,
      model: agent.model,
      status: 'running',
      verdict: null,
      score: null,
      summary: null,
      duration_ms: null,
      cost_usd: null,
      findings: [],
    }));

    return {
      id: multiRun.id,
      pr_id: prId,
      pr_number: pull.number ?? null,
      ran_at: multiRun.ranAt.toISOString(),
      agent_count: targets.length,
      total_duration_ms: 0,
      total_cost_usd: null,
      columns,
      conflicts: [],
    };
  }

  /**
   * Read a multi-agent-run: the latest for a PR when `multiRunId` is
   * omitted (AC-13), or one specific run when given (AC-18). Builds
   * `AgentColumn`s from the linked `agent_runs`/`reviews`/`findings`
   * (AC-14), aggregates `total_duration_ms` (MAX) / `total_cost_usd` (SUM,
   * ignoring nulls — AC-15), and computes `conflicts` ON-READ from only the
   * `done` columns (AC-8/AC-16/EC-10; D-2 — never persisted).
   */
  async readMultiRun(workspaceId: string, prId: string, multiRunId?: string): Promise<MultiAgentRun> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const multiRun = multiRunId
      ? await this.repo.getMultiRunById(workspaceId, multiRunId)
      : await this.repo.getLatestMultiRun(workspaceId, prId);
    if (!multiRun || multiRun.prId !== prId) throw new NotFoundError('Multi-agent run not found');

    const rows = await this.repo.runsWithFindingsForMultiRun(multiRun.id);
    const columns: AgentColumn[] = rows.map((row) => toAgentColumn(row));

    const durations = columns.map((c) => c.duration_ms).filter((d): d is number => d != null);
    const total_duration_ms = durations.length > 0 ? Math.max(...durations) : 0;
    const costs = columns.map((c) => c.cost_usd).filter((c): c is number => c != null);
    const total_cost_usd = costs.length > 0 ? costs.reduce((a, b) => a + b, 0) : null;

    // Feed the grouping the RAW finding rows (not the trimmed AgentColumnFinding
    // projection): those carry the real `rationale` and `end_line`, so a take's
    // note shows the agent's actual reasoning (AC-9/AC-26) and multi-line
    // findings overlap on their true range (not a zero-width single line).
    const doneRuns: ConflictGroupingRun[] = rows
      .filter((row) => row.run.status === 'done')
      .map((row) => ({
        agentId: row.run.agentId ?? '',
        agentName: row.agentName ?? 'Unknown agent',
        findings: row.findings.map((f) => ({
          id: f.id,
          file: f.file,
          startLine: f.startLine,
          endLine: f.endLine,
          severity: f.severity as Severity,
          title: f.title,
          rationale: f.rationale,
        })),
      }));
    const conflicts = computeConflicts(doneRuns);

    return {
      id: multiRun.id,
      pr_id: prId,
      pr_number: pull.number ?? null,
      ran_at: multiRun.ranAt.toISOString(),
      agent_count: columns.length,
      total_duration_ms,
      total_cost_usd,
      columns,
      conflicts,
    };
  }

  /**
   * Multi-agent run history (newest first), optionally scoped to one PR —
   * the global "Multi-Agent Review" nav landing page and the PR-detail
   * "Multi-agent runs" link. Pure mapping over the repository's aggregated
   * rows; no Drizzle types leak out (onion-architecture).
   */
  async listMultiRuns(workspaceId: string, prId?: string): Promise<MultiAgentRunSummary[]> {
    const rows = await this.repo.listMultiRuns(workspaceId, prId);
    return rows.map((r) => ({
      id: r.id,
      pr_id: r.prId,
      pr_number: r.prNumber,
      pr_title: r.prTitle,
      ran_at: r.ranAt.toISOString(),
      agent_count: r.agentCount,
      total_cost_usd: r.totalCostUsd,
      total_duration_ms: r.totalDurationMs,
    }));
  }

  /**
   * Pre-run estimate for a set of agents (SPEC-05 G-5, D-4/D-6). Per-agent
   * average over each agent's last 5 `done` runs; aggregate is MAX time /
   * SUM cost over only the agents that have history (AC-19..AC-22, EC-7).
   * Does not validate `agentIds` belong to the workspace beyond scoping the
   * history query itself — an unknown/foreign id simply comes back with no
   * history (`null`/`null`), same as a real agent that never ran; this is a
   * read-only estimate, not a mutation, so there is nothing unsafe to guard.
   */
  async estimateAgents(workspaceId: string, agentIds: string[]): Promise<AgentEstimates> {
    const history = await this.repo.estimateForAgents(workspaceId, agentIds, 5);
    const per_agent: AgentEstimate[] = agentIds.map((id) =>
      averageAgentHistory(id, history.get(id) ?? []),
    );
    return { per_agent, ...aggregateEstimates(per_agent) };
  }
}

function toAgentColumn(row: RunWithFindings): AgentColumn {
  const status: AgentColumn['status'] =
    row.run.status === 'done' ? 'done' : row.run.status === 'running' ? 'running' : 'failed';
  return {
    run_id: row.run.id,
    agent_id: row.run.agentId ?? '',
    agent_name: row.agentName ?? 'Unknown agent',
    provider: row.run.provider,
    model: row.run.model,
    status,
    verdict: row.review?.verdict ?? null,
    score: row.review?.score ?? null,
    summary: row.review?.summary ?? null,
    duration_ms: row.run.durationMs,
    cost_usd: row.run.costUsd,
    findings: row.findings.map((f) => ({
      id: f.id,
      severity: f.severity as AgentColumn['findings'][number]['severity'],
      category: f.category,
      title: f.title,
      file: f.file,
      start_line: f.startLine,
      kind: f.kind,
    })),
  };
}
