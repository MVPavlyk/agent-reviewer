import { createHash } from 'node:crypto';
import type { EvalBatchRecord, EvalCaseRecord } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import { EvalsRepository, type EvalCaseRow, type EvalRunBatchRow, type EvalRunRow } from './repository.js';
import { sliceFindingHunks } from './hunk-slice.js';
import { slugify, uniqueCaseName } from './helpers.js';
import { EvalBatchExecutor, type BatchExecutorLogger } from './batch-executor.js';

/**
 * evals module service. Business logic for turning a resolved finding into
 * an eval case (Крок 8), starting a "run all evals" batch (Крок 9-10), and
 * the read models the UI polls/lists (Крок 11). No Fastify/Drizzle types
 * cross this boundary — the repository is the only place touching the DB.
 */

export interface CreateCaseFromFindingResult {
  caseId: string;
  created: boolean;
}

export interface StartBatchResult {
  batchId: string;
  status: string;
}

/** Server-side DTO — the shared `EvalBatchRecord` contract; narrowed at the mapping site (`toBatchDto`). */
export type EvalBatchDto = EvalBatchRecord;

/** Server-side DTO — the shared `EvalCaseRecord` contract; narrowed at the mapping site (`toCaseDto`). */
export type EvalCaseDto = EvalCaseRecord;

export class EvalsService {
  private repo: EvalsRepository;
  private executor: EvalBatchExecutor;

  constructor(private container: Container) {
    this.repo = new EvalsRepository(container.db);
    this.executor = new EvalBatchExecutor(container, this.repo);
  }

  /**
   * Turn a resolved (accepted/dismissed) finding into an eval case owned by
   * the review's agent. Idempotent: a second call for the same finding
   * returns the SAME case id instead of creating a duplicate (AC-17).
   *
   * Refusals (never create a row): unresolved finding (422), `kind !==
   * 'finding'` (422), review with no agent (422), PR/file with no patch or a
   * hunk slice that misses the finding's lines (422) — AC-18.
   */
  async createCaseFromFinding(
    workspaceId: string,
    findingId: string,
  ): Promise<CreateCaseFromFindingResult> {
    const ctx = await this.repo.findingContext(findingId);
    if (!ctx || ctx.pull.workspaceId !== workspaceId) {
      throw new NotFoundError('Finding not found');
    }
    const { finding, review, pull } = ctx;

    if (finding.kind !== 'finding') {
      throw new ValidationError(
        `Findings of kind '${finding.kind}' cannot become eval cases`,
      );
    }
    if (!finding.acceptedAt && !finding.dismissedAt) {
      throw new ValidationError('Accept or Dismiss the finding first');
    }
    if (!review.agentId) {
      throw new ValidationError('The finding\'s review has no agent; cannot create an eval case');
    }

    const ownerKind = 'agent' as const;
    const ownerId = review.agentId;

    // Idempotent: the same finding always maps to the same case.
    const existing = await this.repo.findCaseBySourceFinding(workspaceId, ownerKind, ownerId, findingId);
    if (existing) return { caseId: existing.id, created: false };

    const file = await this.repo.prFileByPath(pull.id, finding.file);
    if (!file?.patch) {
      throw new ValidationError('The PR has no patch for this finding\'s file');
    }

    const inputDiff = sliceFindingHunks(file.patch, finding.file, finding.startLine, finding.endLine);
    if (!inputDiff) {
      throw new ValidationError('No diff hunk covers this finding\'s lines');
    }

    const accepted = Boolean(finding.acceptedAt);
    const expectedOutput = accepted
      ? [
          {
            file: finding.file,
            start_line: finding.startLine,
            end_line: finding.endLine,
            severity: finding.severity,
            category: finding.category,
            title: finding.title,
          },
        ]
      : [];

    const inputMeta = {
      source_finding: {
        finding_id: finding.id,
        file: finding.file,
        start_line: finding.startLine,
        end_line: finding.endLine,
        decision: accepted ? ('accepted' as const) : ('dismissed' as const),
      },
      pr_id: pull.id,
      pr_number: pull.number,
      review_id: review.id,
    };

    const existingNames = await this.repo.caseNamesForOwner(workspaceId, ownerKind, ownerId);
    const name = uniqueCaseName(slugify(finding.title), existingNames);

    const row = await this.repo.insertCase({
      workspaceId,
      ownerKind,
      ownerId,
      name,
      inputDiff,
      inputFiles: [finding.file],
      inputMeta,
      expectedOutput,
      notes: null,
    });

    return { caseId: row.id, created: true };
  }

  // ===========================================================================
  // Крок 9 — start a batch ("run all evals" for one agent)
  // ===========================================================================

  /**
   * Snapshot the agent's config (system prompt, hash, model, provider, enabled
   * skill names, version) and the FIXED set of its current case ids, insert a
   * `running` batch row, and kick off the (unawaited) executor — the route
   * returns `batch_id` before the model is ever called (AC-19/AC-20). The
   * snapshot is read ONCE here; a later edit to `agents.system_prompt` never
   * changes what this batch already recorded (AC-22). A case created after
   * this call is not in `case_ids` (AC-23/EC-20).
   */
  async startBatch(
    workspaceId: string,
    agentId: string,
    label: string | null,
    logger?: BatchExecutorLogger,
  ): Promise<StartBatchResult> {
    const agent = await this.repo.getAgent(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');

    const cases = await this.repo.allCasesForOwner(workspaceId, 'agent', agentId);
    if (cases.length === 0) {
      throw new ValidationError('This agent has no eval cases yet — turn a resolved finding into one first');
    }

    const skillLinks = await this.container.agentsRepo.linkedSkills(agentId);
    const enabledLinks = skillLinks.filter((l) => l.skill.enabled).sort((a, b) => a.order - b.order);
    // Resolved BODIES snapshotted now (frozen for the executor), keyed under
    // the same `skill_slugs` column the contract already defines — this repo
    // has no separate skill-slug concept, so the snapshot carries the enabled
    // skills' names (for display) while the resolved bodies are handed to the
    // executor directly below (never re-read from the DB mid-run).
    const skillBodies = enabledLinks.map((l) => `### ${l.skill.name}\n${l.skill.body}`);
    const skillNames = enabledLinks.map((l) => l.skill.name);

    const systemPromptHash = createHash('sha256').update(agent.systemPrompt).digest('hex');

    const batch = await this.repo.insertBatch({
      workspaceId,
      agentId,
      agentVersion: agent.version,
      systemPromptSnapshot: agent.systemPrompt,
      systemPromptHash,
      model: agent.model,
      provider: agent.provider,
      skillSlugs: skillNames,
      caseIds: cases.map((c) => c.id),
      status: 'running',
      label,
    });

    // Fire-and-forget (server/INSIGHTS.md 2026-08-01): a rejected background
    // promise must never crash the process — logged here, never re-thrown.
    void this.executor.run(batch, cases, skillBodies, logger).catch((err) => {
      logger?.error({ batchId: batch.id, err: (err as Error).message }, 'eval batch: background execution crashed');
    });

    return { batchId: batch.id, status: batch.status };
  }

  // ===========================================================================
  // Крок 11 — read routes (batches, cases, compare) — all pre-computed
  // aggregates (NFR-1), all scoped by workspace; a foreign resource → 404.
  // ===========================================================================

  async getAgentEvalCases(workspaceId: string, agentId: string): Promise<EvalCaseDto[]> {
    const agent = await this.repo.getAgent(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');

    const cases = await this.repo.allCasesForOwner(workspaceId, 'agent', agentId);
    const lastRuns = await this.repo.lastRunsForCases(cases.map((c) => c.id));
    return cases.map((c) => toCaseDto(c, lastRuns.get(c.id)));
  }

  async getAgentEvalBatches(workspaceId: string, agentId: string): Promise<EvalBatchDto[]> {
    const agent = await this.repo.getAgent(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');

    const batches = await this.repo.listBatchesForAgent(workspaceId, agentId);
    return batches.map(toBatchDto);
  }

  /** One batch, suitable for polling: status + pre-computed aggregates + how many cases have a row yet. */
  async getBatch(
    workspaceId: string,
    batchId: string,
  ): Promise<{ batch: EvalBatchDto; completed_cases: number }> {
    const batch = await this.repo.getBatch(workspaceId, batchId);
    if (!batch) throw new NotFoundError('Eval run batch not found');
    const runs = await this.repo.runsForBatch(batch.id);
    return { batch: toBatchDto(batch), completed_cases: runs.length };
  }

  /** Both batch snapshots + a per-case presence/pass comparison row (classification is UI logic — Крок 18). */
  async compareBatches(
    workspaceId: string,
    batchIdA: string,
    batchIdB: string,
  ): Promise<{
    batch_a: EvalBatchDto;
    batch_b: EvalBatchDto;
    cases: {
      case_id: string;
      case_name: string;
      in_a: boolean;
      in_b: boolean;
      pass_a: boolean | null;
      pass_b: boolean | null;
    }[];
  }> {
    const [a, b] = await Promise.all([
      this.repo.getBatch(workspaceId, batchIdA),
      this.repo.getBatch(workspaceId, batchIdB),
    ]);
    if (!a || !b) throw new NotFoundError('Eval run batch not found');
    if (a.agentId !== b.agentId) throw new ValidationError('Batches belong to different agents');

    const caseIdsA = (a.caseIds as string[]) ?? [];
    const caseIdsB = (b.caseIds as string[]) ?? [];
    const unionIds = Array.from(new Set([...caseIdsA, ...caseIdsB]));

    const [cases, runs] = await Promise.all([
      this.repo.casesByIds(workspaceId, unionIds),
      this.repo.runsForBatches([a.id, b.id]),
    ]);
    const caseNameById = new Map(cases.map((c) => [c.id, c.name]));
    const runByCaseAndBatch = new Map(runs.map((r) => [`${r.caseId}:${r.batchId}`, r]));

    const rows = unionIds.map((caseId) => {
      const runA = runByCaseAndBatch.get(`${caseId}:${a.id}`);
      const runB = runByCaseAndBatch.get(`${caseId}:${b.id}`);
      return {
        case_id: caseId,
        case_name: caseNameById.get(caseId) ?? caseId,
        in_a: caseIdsA.includes(caseId),
        in_b: caseIdsB.includes(caseId),
        pass_a: runA?.pass ?? null,
        pass_b: runB?.pass ?? null,
      };
    });

    return { batch_a: toBatchDto(a), batch_b: toBatchDto(b), cases: rows };
  }

  /**
   * One row per agent that has at least one eval case: its latest batch (or
   * `null` if never run) + how many cases it has. Agents with zero cases are
   * omitted — an EMPTY list, never a row of zeros (EC-11 / AC-58's server side).
   */
  async dashboard(workspaceId: string): Promise<
    {
      agent_id: string;
      agent_name: string;
      agent_enabled: boolean;
      cases_total: number;
      latest_batch: EvalBatchDto | null;
    }[]
  > {
    const agents = await this.container.agentsRepo.list(workspaceId);
    const batches = await this.repo.listBatchesForWorkspace(workspaceId);
    const latestByAgent = new Map<string, EvalRunBatchRow>();
    for (const b of batches) {
      // `batches` is ordered by `started_at DESC` — first hit per agent wins.
      if (!latestByAgent.has(b.agentId)) latestByAgent.set(b.agentId, b);
    }

    const rows: {
      agent_id: string;
      agent_name: string;
      agent_enabled: boolean;
      cases_total: number;
      latest_batch: EvalBatchDto | null;
    }[] = [];
    for (const agent of agents) {
      const cases = await this.repo.allCasesForOwner(workspaceId, 'agent', agent.id);
      if (cases.length === 0) continue;
      const latest = latestByAgent.get(agent.id);
      rows.push({
        agent_id: agent.id,
        agent_name: agent.name,
        agent_enabled: agent.enabled,
        cases_total: cases.length,
        latest_batch: latest ? toBatchDto(latest) : null,
      });
    }
    return rows;
  }
}

function toBatchDto(row: EvalRunBatchRow): EvalBatchDto {
  return {
    id: row.id,
    agent_id: row.agentId,
    agent_version: row.agentVersion,
    system_prompt_snapshot: row.systemPromptSnapshot,
    system_prompt_hash: row.systemPromptHash,
    model: row.model,
    provider: row.provider,
    skill_slugs: (row.skillSlugs as string[] | null) ?? null,
    case_ids: (row.caseIds as string[]) ?? [],
    status: row.status as EvalBatchDto['status'],
    recall: row.recall,
    precision: row.precision,
    citation_accuracy: row.citationAccuracy,
    cost_usd: row.costUsd,
    traces_passed: row.tracesPassed,
    traces_total: row.tracesTotal,
    duration_ms: row.durationMs,
    label: row.label,
    error: row.error,
    started_at: row.startedAt.toISOString(),
    finished_at: row.finishedAt ? row.finishedAt.toISOString() : null,
  };
}

function toCaseDto(row: EvalCaseRow, lastRun: EvalRunRow | undefined): EvalCaseDto {
  return {
    id: row.id,
    owner_kind: row.ownerKind as EvalCaseDto['owner_kind'],
    owner_id: row.ownerId,
    name: row.name,
    input_diff: row.inputDiff ?? '',
    input_meta: row.inputMeta,
    expected_output: row.expectedOutput,
    notes: row.notes,
    last_run: lastRun
      ? { run_id: lastRun.id, batch_id: lastRun.batchId, pass: lastRun.pass, ran_at: lastRun.ranAt.toISOString() }
      : null,
  };
}
