/**
 * Read routes (Крок 11, SPEC-05):
 *   GET /agents/:id/eval-cases · GET /agents/:id/eval-runs · GET /eval-runs/:batchId
 *   GET /eval-runs/compare?a=&b= · GET /evals/dashboard
 * Testcontainers pg. Run in isolation per the plan (§6, R-3):
 * `pnpm exec vitest run eval-read.it.test`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider } from '../src/adapters/index.js';
import * as t from '../src/db/schema.js';
import type { Review } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const REVIEW_FIXTURE: Review = {
  verdict: 'comment',
  summary: 'ok',
  score: 90,
  findings: [],
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

async function insertCase(db: PgFixture['handle']['db'], workspaceId: string, agentId: string) {
  const [row] = await db
    .insert(t.evalCases)
    .values({
      workspaceId,
      ownerKind: 'agent',
      ownerId: agentId,
      name: `case-${Math.random().toString(36).slice(2, 8)}`,
      inputDiff: PATCH_HUNK,
      inputFiles: ['src/api/users.ts'],
      inputMeta: null,
      expectedOutput: [],
      notes: null,
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

d('Eval read routes (Testcontainers pg)', () => {
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

  function appWithLLM() {
    const llm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { llm: { openrouter: llm, openai: llm, anthropic: llm } },
    });
  }

  it('every read route 404s on a foreign-workspace resource', async () => {
    const app = await appWithLLM();
    const [otherWs] = await pg.handle.db.insert(t.workspaces).values({ name: `other-${Math.random()}` }).returning();
    const [otherAgent] = await pg.handle.db
      .insert(t.agents)
      .values({ workspaceId: otherWs!.id, name: 'Foreign', provider: 'openai', model: 'gpt-4.1', systemPrompt: 'x' })
      .returning();
    const otherCase = await insertCase(pg.handle.db, otherWs!.id, otherAgent!.id);
    const [otherBatch] = await pg.handle.db
      .insert(t.evalRunBatches)
      .values({
        workspaceId: otherWs!.id,
        agentId: otherAgent!.id,
        agentVersion: 1,
        systemPromptSnapshot: 'x',
        systemPromptHash: 'h',
        model: 'gpt-4.1',
        provider: 'openai',
        caseIds: [otherCase.id],
        status: 'succeeded',
      })
      .returning();

    expect((await app.inject({ method: 'GET', url: `/agents/${otherAgent!.id}/eval-cases` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/agents/${otherAgent!.id}/eval-runs` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/eval-runs/${otherBatch!.id}` })).statusCode).toBe(404);
    expect(
      (await app.inject({ method: 'GET', url: `/eval-runs/compare?a=${otherBatch!.id}&b=${otherBatch!.id}` }))
        .statusCode,
    ).toBe(404);

    await app.close();
  });

  it('GET /eval-runs/:batchId is poll-friendly: status + growing completed-case count', async () => {
    const app = await appWithLLM();
    await insertCase(pg.handle.db, workspaceId, agentId);
    await insertCase(pg.handle.db, workspaceId, agentId);

    const start = await app.inject({ method: 'POST', url: `/agents/${agentId}/eval-runs` });
    const batchId = start.json().batch_id as string;

    const poll = await app.inject({ method: 'GET', url: `/eval-runs/${batchId}` });
    expect(poll.statusCode).toBe(200);
    // The batch may already be done by the time we poll (mock LLM is fast);
    // either way the shape is present and internally consistent.
    expect(typeof poll.json().completed_cases).toBe('number');
    expect(poll.json().batch.id).toBe(batchId);

    await waitForBatch(pg.handle.db, batchId);
    const done = await app.inject({ method: 'GET', url: `/eval-runs/${batchId}` });
    expect(done.json().batch.status).not.toBe('running');
    expect(done.json().completed_cases).toBe(2);

    await app.close();
  });

  it('GET /evals/dashboard omits agents with zero eval cases; never a row of zeros (EC-11)', async () => {
    const app = await appWithLLM();
    const [freshAgent] = await pg.handle.db
      .insert(t.agents)
      .values({
        workspaceId,
        name: `No Cases ${Math.random()}`,
        provider: 'openai',
        model: 'gpt-4.1',
        systemPrompt: 'x',
      })
      .returning();

    const res = await app.inject({ method: 'GET', url: '/evals/dashboard' });
    expect(res.statusCode).toBe(200);
    const rows = res.json() as { agent_id: string }[];
    expect(rows.some((r) => r.agent_id === freshAgent!.id)).toBe(false);

    await app.close();
  });

  it('GET /eval-runs/compare returns both batch snapshots + a per-case row', async () => {
    const app = await appWithLLM();
    const caseA = await insertCase(pg.handle.db, workspaceId, agentId);

    const startA = await app.inject({ method: 'POST', url: `/agents/${agentId}/eval-runs`, payload: { label: 'a' } });
    const batchIdA = startA.json().batch_id as string;
    await waitForBatch(pg.handle.db, batchIdA);

    const caseB = await insertCase(pg.handle.db, workspaceId, agentId);
    const startB = await app.inject({ method: 'POST', url: `/agents/${agentId}/eval-runs`, payload: { label: 'b' } });
    const batchIdB = startB.json().batch_id as string;
    await waitForBatch(pg.handle.db, batchIdB);

    const res = await app.inject({ method: 'GET', url: `/eval-runs/compare?a=${batchIdA}&b=${batchIdB}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.batch_a.system_prompt_snapshot).toBeTruthy();
    expect(body.batch_b.system_prompt_snapshot).toBeTruthy();
    const rowA = body.cases.find((c: { case_id: string }) => c.case_id === caseA.id);
    const rowB = body.cases.find((c: { case_id: string }) => c.case_id === caseB.id);
    expect(rowA.in_a).toBe(true);
    expect(rowA.in_b).toBe(true); // caseA is present in both (it was already there for batch B)
    expect(rowB.in_a).toBe(false); // caseB didn't exist yet when batch A started
    expect(rowB.in_b).toBe(true);

    await app.close();
  });

  it('GET /eval-runs/compare 422s when the two batches belong to different agents (ARCH-WARNING-2)', async () => {
    const app = await appWithLLM();

    await insertCase(pg.handle.db, workspaceId, agentId);
    const startA = await app.inject({ method: 'POST', url: `/agents/${agentId}/eval-runs` });
    const batchIdA = startA.json().batch_id as string;
    await waitForBatch(pg.handle.db, batchIdA);

    const [otherAgent] = await pg.handle.db
      .insert(t.agents)
      .values({ workspaceId, name: `Other Agent ${Math.random()}`, provider: 'openai', model: 'gpt-4.1', systemPrompt: 'x' })
      .returning();
    await insertCase(pg.handle.db, workspaceId, otherAgent!.id);
    const startB = await app.inject({ method: 'POST', url: `/agents/${otherAgent!.id}/eval-runs` });
    const batchIdB = startB.json().batch_id as string;
    await waitForBatch(pg.handle.db, batchIdB);

    const res = await app.inject({ method: 'GET', url: `/eval-runs/compare?a=${batchIdA}&b=${batchIdB}` });
    expect(res.statusCode).toBe(422);

    await app.close();
  });
});
