/**
 * POST /agents/:id/eval-runs (Крок 9, SPEC-05) — batch creation + snapshot,
 * and the background executor's scoring/aggregation (Крок 10). Testcontainers pg.
 *
 * Run in isolation per the plan (§6, R-3): `pnpm exec vitest run eval-runs.it.test`.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider } from '../src/adapters/index.js';
import * as t from '../src/db/schema.js';
import type {
  Review,
  LLMProvider,
  ModelInfo,
  CompletionRequest,
  CompletionResult,
  StructuredRequest,
  StructuredResult,
} from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

/** Matches the (single-hunk) case fixture below: new lines 1-6. */
const REVIEW_FIXTURE: Review = {
  verdict: 'comment',
  summary: 'Looks fine.',
  score: 90,
  findings: [
    {
      id: 'f-1',
      severity: 'WARNING',
      category: 'perf',
      title: 'N+1 query in user list endpoint',
      file: 'src/api/users.ts',
      start_line: 2,
      end_line: 4,
      rationale: 'Loop issues one query per user.',
      confidence: 0.8,
      kind: 'finding',
    },
  ],
};

const PATCH_HUNK = [
  '@@ -1,3 +1,6 @@',
  ' export async function listUsers(ids) {',
  '-  return ids.map((id) => db.users.findOne(id));',
  '+  const users = [];',
  '+  for (const id of ids) {',
  '+    users.push(await db.users.findOne(id));',
  '+  }',
  '+  return users;',
  ' }',
].join('\n');

async function insertCase(
  db: PgFixture['handle']['db'],
  workspaceId: string,
  agentId: string,
  overrides: Partial<typeof t.evalCases.$inferInsert> = {},
) {
  const [row] = await db
    .insert(t.evalCases)
    .values({
      workspaceId,
      ownerKind: 'agent',
      ownerId: agentId,
      name: `case-${Math.random().toString(36).slice(2, 8)}`,
      inputDiff: PATCH_HUNK,
      inputFiles: ['src/api/users.ts'],
      inputMeta: {
        source_finding: { finding_id: 'f-1', file: 'src/api/users.ts', start_line: 2, end_line: 4 },
      },
      expectedOutput: [
        { file: 'src/api/users.ts', start_line: 2, end_line: 4, severity: 'WARNING', category: 'perf' },
      ],
      notes: null,
      ...overrides,
    })
    .returning();
  return row!;
}

async function waitForBatch(
  db: PgFixture['handle']['db'],
  batchId: string,
  timeoutMs = 5000,
): Promise<typeof t.evalRunBatches.$inferSelect> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const [row] = await db.select().from(t.evalRunBatches).where(eq(t.evalRunBatches.id, batchId));
    if (row && row.status !== 'running') return row;
    if (Date.now() > deadline) throw new Error(`batch ${batchId} still 'running' after ${timeoutMs}ms`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

/**
 * Wraps a MockLLMProvider so `completeStructured` blocks until `release()` is
 * called — the only way to observe the batch mid-flight (AC-19/AC-29) without
 * a fixed sleep. Delegates every other method untouched.
 */
class GatedLLMProvider implements LLMProvider {
  readonly id: 'openai' | 'anthropic';
  private release!: () => void;
  private readonly gate: Promise<void>;

  constructor(private readonly inner: MockLLMProvider) {
    this.id = inner.id;
    this.gate = new Promise((resolve) => {
      this.release = resolve;
    });
  }

  releaseGate(): void {
    this.release();
  }

  async listModels(): Promise<ModelInfo[]> {
    return this.inner.listModels();
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    return this.inner.complete(req);
  }

  async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    await this.gate;
    return this.inner.completeStructured<T>(req);
  }

  async embed(texts: string[]): Promise<number[][]> {
    return this.inner.embed(texts);
  }
}

/**
 * Like GatedLLMProvider, but gates each `completeStructured` call
 * independently (by call order) instead of sharing one gate across every
 * case — needed to let case 1 finish while case 2 stays blocked, to prove
 * `completed_cases` advances mid-batch (fix-plan-4).
 */
class PerCallGatedLLMProvider implements LLMProvider {
  readonly id: 'openai' | 'anthropic';
  private readonly gates: Array<{ promise: Promise<void>; release: () => void }>;
  private callIndex = 0;

  constructor(
    private readonly inner: MockLLMProvider,
    gateCount: number,
  ) {
    this.id = inner.id;
    this.gates = Array.from({ length: gateCount }, () => {
      let release!: () => void;
      const promise = new Promise<void>((resolve) => {
        release = resolve;
      });
      return { promise, release };
    });
  }

  releaseGate(index: number): void {
    this.gates[index]?.release();
  }

  async listModels(): Promise<ModelInfo[]> {
    return this.inner.listModels();
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    return this.inner.complete(req);
  }

  async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const idx = this.callIndex++;
    await this.gates[idx]?.promise;
    return this.inner.completeStructured<T>(req);
  }

  async embed(texts: string[]): Promise<number[][]> {
    return this.inner.embed(texts);
  }
}

d('POST /agents/:id/eval-runs (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let agentId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    const [agent] = await pg.handle.db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, 'General Reviewer')));
    agentId = agent!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  // Every test inserts its own eval cases via insertCase(...) and batches via
  // POST /eval-runs, all scoped to the single `agentId` shared across this
  // file's beforeAll. A batch run (Крок 9/10) picks up *every* case belonging
  // to the agent (AC-23), so leftover cases/batches from a previous test would
  // leak into the next one's counts. Delete batches first (cascades eval_runs
  // via batch_id FK), then cases (cascades any remaining eval_runs via
  // case_id FK), so each test starts from a clean slate regardless of order.
  afterEach(async () => {
    await pg.handle.db.delete(t.evalRunBatches).where(eq(t.evalRunBatches.agentId, agentId));
    await pg.handle.db.delete(t.evalCases).where(and(eq(t.evalCases.ownerKind, 'agent'), eq(t.evalCases.ownerId, agentId)));
  });

  function appWithLLM(llm: LLMProvider) {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { llm: { openrouter: llm, openai: llm, anthropic: llm } },
    });
  }

  async function countBatches(): Promise<number> {
    const rows = await pg.handle.db.select().from(t.evalRunBatches);
    return rows.length;
  }

  // ---- Крок 9: creation + snapshot ---------------------------------------

  it('POST with NO body → 2xx with batch_id + status=running (not 422)', async () => {
    const app = await appWithLLM(new MockLLMProvider('openai', { structured: REVIEW_FIXTURE }));
    await insertCase(pg.handle.db, workspaceId, agentId);

    const res = await app.inject({ method: 'POST', url: `/agents/${agentId}/eval-runs` });
    expect(res.statusCode).toBeLessThan(300);
    const body = res.json();
    expect(body.batch_id).toBeTruthy();
    // The response is returned BEFORE the (unawaited) background executor
    // finishes — it always reports 'running' at this point (AC-19).
    expect(body.status).toBe('running');

    await waitForBatch(pg.handle.db, body.batch_id);
    await app.close();
  });

  it("editing the agent's system_prompt after POST does not change the batch's snapshot (AC-22)", async () => {
    const app = await appWithLLM(new MockLLMProvider('openai', { structured: REVIEW_FIXTURE }));
    await insertCase(pg.handle.db, workspaceId, agentId);

    const [before] = await pg.handle.db.select().from(t.agents).where(eq(t.agents.id, agentId));
    const res = await app.inject({ method: 'POST', url: `/agents/${agentId}/eval-runs` });
    const batchId = res.json().batch_id as string;

    await pg.handle.db
      .update(t.agents)
      .set({ systemPrompt: 'CHANGED AFTER THE BATCH STARTED — should never leak into the snapshot' })
      .where(eq(t.agents.id, agentId));

    const [row] = await pg.handle.db.select().from(t.evalRunBatches).where(eq(t.evalRunBatches.id, batchId));
    expect(row!.systemPromptSnapshot).toBe(before!.systemPrompt);

    // restore for later tests in this file
    await pg.handle.db.update(t.agents).set({ systemPrompt: before!.systemPrompt }).where(eq(t.agents.id, agentId));
    await waitForBatch(pg.handle.db, batchId);
    await app.close();
  });

  it('a case created AFTER the POST is absent from case_ids (EC-20/AC-23)', async () => {
    const app = await appWithLLM(new MockLLMProvider('openai', { structured: REVIEW_FIXTURE }));
    await insertCase(pg.handle.db, workspaceId, agentId);

    const res = await app.inject({ method: 'POST', url: `/agents/${agentId}/eval-runs` });
    const batchId = res.json().batch_id as string;
    const late = await insertCase(pg.handle.db, workspaceId, agentId);

    const [row] = await pg.handle.db.select().from(t.evalRunBatches).where(eq(t.evalRunBatches.id, batchId));
    expect((row!.caseIds as string[]).includes(late.id)).toBe(false);

    await waitForBatch(pg.handle.db, batchId);
    await app.close();
  });

  it('an agent with zero eval cases → 422, no new batch row', async () => {
    const app = await appWithLLM(new MockLLMProvider('openai', { structured: REVIEW_FIXTURE }));
    const [emptyAgent] = await pg.handle.db
      .insert(t.agents)
      .values({
        workspaceId,
        name: `No Cases Yet ${Math.random()}`,
        provider: 'openai',
        model: 'gpt-4.1',
        systemPrompt: 'You review code.',
      })
      .returning();

    const before = await countBatches();
    const res = await app.inject({ method: 'POST', url: `/agents/${emptyAgent!.id}/eval-runs` });
    expect(res.statusCode).toBe(422);
    expect(await countBatches()).toBe(before);

    await app.close();
  });

  it('an agent belonging to another workspace → 404', async () => {
    const app = await appWithLLM(new MockLLMProvider('openai', { structured: REVIEW_FIXTURE }));
    const [otherWs] = await pg.handle.db.insert(t.workspaces).values({ name: `other-${Math.random()}` }).returning();
    const [otherAgent] = await pg.handle.db
      .insert(t.agents)
      .values({
        workspaceId: otherWs!.id,
        name: 'Other WS Agent',
        provider: 'openai',
        model: 'gpt-4.1',
        systemPrompt: 'x',
      })
      .returning();

    const res = await app.inject({ method: 'POST', url: `/agents/${otherAgent!.id}/eval-runs` });
    expect(res.statusCode).toBe(404);

    await app.close();
  });

  // ---- Крок 10: executor + scoring ---------------------------------------

  it('all cases succeed → running transitions to succeeded, with a scored ReviewInput (AC-25/AC-83/AC-84)', async () => {
    const llm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const app = await appWithLLM(llm);
    await insertCase(pg.handle.db, workspaceId, agentId);

    const res = await app.inject({ method: 'POST', url: `/agents/${agentId}/eval-runs` });
    const batchId = res.json().batch_id as string;
    const batch = await waitForBatch(pg.handle.db, batchId);

    expect(batch.status).toBe('succeeded');
    expect(batch.tracesTotal).toBe((batch.caseIds as string[]).length);

    // The assembled prompt reaching the LLM has NO intent/repoMap/callers/
    // memory/specs/prDescription section, and never leaks an expected_output
    // value (AC-25, AC-83, AC-84) — reviewer-core omits a slot's heading
    // entirely when the corresponding ReviewInput field is absent.
    const structuredCalls = llm.calls.filter((c) => c.method === 'completeStructured');
    expect(structuredCalls.length).toBeGreaterThan(0);
    const messagesText = JSON.stringify(structuredCalls.map((c) => (c.req as { messages: unknown }).messages));
    for (const forbidden of [
      '## PR intent & scope',
      '## Repo skeleton',
      '## Callers of changed symbols',
      '## Project context',
      '## PR description',
    ]) {
      expect(messagesText).not.toContain(forbidden);
    }
    expect(messagesText).not.toContain('N+1 query in user list endpoint');

    const runs = await pg.handle.db.select().from(t.evalRuns).where(eq(t.evalRuns.batchId, batchId));
    expect(runs).toHaveLength(1);
    expect(runs[0]!.pass).toBe(true);
    expect((runs[0]!.actualOutput as { unmatched_count: number }).unmatched_count).toBe(0);

    await app.close();
  });

  it('one case fails, one succeeds → batch partial; the failing case still gets a row', async () => {
    const llm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const app = await appWithLLM(llm);
    const good = await insertCase(pg.handle.db, workspaceId, agentId);
    // No input_diff/input_files → the executor's own guard throws before any LLM call.
    const bad = await insertCase(pg.handle.db, workspaceId, agentId, { inputDiff: '', inputFiles: [] });

    const res = await app.inject({ method: 'POST', url: `/agents/${agentId}/eval-runs` });
    const batchId = res.json().batch_id as string;
    const batch = await waitForBatch(pg.handle.db, batchId);

    expect(batch.status).toBe('partial');
    expect(batch.tracesTotal).toBe(2);

    const runs = await pg.handle.db.select().from(t.evalRuns).where(eq(t.evalRuns.batchId, batchId));
    const byCaseId = new Map(runs.map((r) => [r.caseId, r]));
    expect(byCaseId.get(good.id)!.pass).toBe(true);
    expect(byCaseId.get(bad.id)!.pass).toBeNull();

    await app.close();
  });

  it('every case fails → batch failed, all 4 metric aggregates null', async () => {
    const llm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const app = await appWithLLM(llm);
    await insertCase(pg.handle.db, workspaceId, agentId, { inputDiff: '', inputFiles: [] });
    await insertCase(pg.handle.db, workspaceId, agentId, { inputDiff: '', inputFiles: [] });

    const res = await app.inject({ method: 'POST', url: `/agents/${agentId}/eval-runs` });
    const batchId = res.json().batch_id as string;
    const batch = await waitForBatch(pg.handle.db, batchId);

    expect(batch.status).toBe('failed');
    expect(batch.recall).toBeNull();
    expect(batch.precision).toBeNull();
    expect(batch.citationAccuracy).toBeNull();
    expect(batch.costUsd).toBeNull();
    expect(batch.tracesTotal).toBe(2);

    await app.close();
  });

  it('an eval batch never writes to reviews/findings/agent_runs (D-6)', async () => {
    const llm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const app = await appWithLLM(llm);
    await insertCase(pg.handle.db, workspaceId, agentId);

    const countAll = async () => ({
      reviews: (await pg.handle.db.select().from(t.reviews)).length,
      findings: (await pg.handle.db.select().from(t.findings)).length,
      agentRuns: (await pg.handle.db.select().from(t.agentRuns)).length,
    });
    const before = await countAll();

    const res = await app.inject({ method: 'POST', url: `/agents/${agentId}/eval-runs` });
    await waitForBatch(pg.handle.db, res.json().batch_id);

    const after = await countAll();
    expect(after).toEqual(before);

    await app.close();
  });

  it('the completeStructured call carries temperature=0 or undefined, never anything else (AC-26)', async () => {
    const llm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const app = await appWithLLM(llm);
    await insertCase(pg.handle.db, workspaceId, agentId);

    const res = await app.inject({ method: 'POST', url: `/agents/${agentId}/eval-runs` });
    await waitForBatch(pg.handle.db, res.json().batch_id);

    const structuredCalls = llm.calls.filter((c) => c.method === 'completeStructured');
    expect(structuredCalls.length).toBeGreaterThan(0);
    for (const call of structuredCalls) {
      const temperature = (call.req as { temperature?: number }).temperature;
      expect(
        temperature === 0 || temperature === undefined,
        `expected temperature to be 0 or undefined, got ${JSON.stringify(temperature)}`,
      ).toBe(true);
    }

    await app.close();
  });

  it(
    'the response returns BEFORE the background run finishes, and the batch is ' +
      "genuinely 'running' with finished_at=null while the LLM call is in flight (AC-19/AC-29)",
    async () => {
      const gated = new GatedLLMProvider(new MockLLMProvider('openai', { structured: REVIEW_FIXTURE }));
      const app = await appWithLLM(gated);
      await insertCase(pg.handle.db, workspaceId, agentId);

      // AC-19: the POST resolves while the (unawaited) executor is still
      // blocked on the LLM call — proven by the gate never having been released.
      const res = await app.inject({ method: 'POST', url: `/agents/${agentId}/eval-runs` });
      expect(res.statusCode).toBeLessThan(300);
      const batchId = res.json().batch_id as string;
      expect(res.json().status).toBe('running');

      // AC-29: mid-flight, the persisted row (not just the POST response) is
      // 'running' with no finished_at — read straight from the DB, not the API.
      const [midFlight] = await pg.handle.db
        .select()
        .from(t.evalRunBatches)
        .where(eq(t.evalRunBatches.id, batchId));
      expect(midFlight!.status).toBe('running');
      expect(midFlight!.finishedAt).toBeNull();

      gated.releaseGate();
      const done = await waitForBatch(pg.handle.db, batchId);
      expect(done.status).not.toBe('running');
      expect(done.finishedAt).not.toBeNull();

      await app.close();
    },
  );

  it(
    "completed_cases advances mid-batch: 1 while status is still 'running', " +
      'then the terminal count, one eval_runs row per case (fix-plan-4)',
    async () => {
      const inner = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
      const gated = new PerCallGatedLLMProvider(inner, 2);
      gated.releaseGate(0); // the first case is free to run to completion...
      // ...the second stays blocked until releaseGate(1) below, so the batch
      // is provably still 'running' with exactly 1 case's row written.
      const app = await appWithLLM(gated);
      const caseA = await insertCase(pg.handle.db, workspaceId, agentId);
      const caseB = await insertCase(pg.handle.db, workspaceId, agentId);

      const res = await app.inject({ method: 'POST', url: `/agents/${agentId}/eval-runs` });
      const batchId = res.json().batch_id as string;

      const deadline = Date.now() + 5000;
      let polled: { batch: { status: string }; completed_cases: number };
      for (;;) {
        const pollRes = await app.inject({ method: 'GET', url: `/eval-runs/${batchId}` });
        polled = pollRes.json();
        if (polled.completed_cases >= 1) break;
        if (Date.now() > deadline) throw new Error(`completed_cases never reached 1 within 5000ms`);
        await new Promise((r) => setTimeout(r, 25));
      }
      // The key assertion this test exists for: the counter moved to 1
      // BEFORE the batch reached a terminal state (fix-plan-4's bug had it
      // stuck at 0 until every case finished).
      expect(polled.completed_cases).toBe(1);
      expect(polled.batch.status).toBe('running');

      gated.releaseGate(1);
      const done = await waitForBatch(pg.handle.db, batchId);
      expect(done.status).toBe('succeeded');

      const finalRes = await app.inject({ method: 'GET', url: `/eval-runs/${batchId}` });
      const finalBody = finalRes.json();
      expect(finalBody.completed_cases).toBe(2);
      expect(finalBody.batch.status).toBe('succeeded');

      // No duplicate row per case — exactly one eval_runs row per case,
      // matching the mid-loop-insert-then-update design (not insert twice).
      const runs = await pg.handle.db.select().from(t.evalRuns).where(eq(t.evalRuns.batchId, batchId));
      expect(runs).toHaveLength(2);
      const caseIds = runs.map((r) => r.caseId).sort();
      expect(caseIds).toEqual([caseA.id, caseB.id].sort());

      await app.close();
    },
  );
});
