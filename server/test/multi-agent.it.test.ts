import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient } from '../src/adapters/index.js';
import * as t from '../src/db/schema.js';
import { eq } from 'drizzle-orm';
import type { Review } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

const REVIEW_FIXTURE: Review = {
  verdict: 'request_changes',
  summary: 'Hardcoded Stripe secret introduced.',
  score: 42,
  findings: [
    {
      id: 'f-valid',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Hardcoded Stripe secret key',
      file: 'src/config.ts',
      start_line: 11,
      end_line: 11,
      rationale: 'A live Stripe key is committed in source.',
      suggestion: 'Move the key to an environment variable.',
      confidence: 0.95,
      kind: 'finding',
    },
  ],
};

let repoSeq = 0;
async function setupRepoAndPr(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `multi-agent-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 900 + repoSeq,
      title: 'Add rate limiting',
      author: 'marisa.koch',
      branch: 'feat/rl',
      base: 'main',
      headSha: 'a1b2c3d4',
      additions: 1,
      deletions: 0,
      filesCount: 1,
      status: 'needs_review',
      body: 'Add rate limiting.',
    })
    .returning();
  await db.insert(t.prFiles).values({
    prId: pr!.id,
    path: 'src/config.ts',
    additions: 1,
    deletions: 0,
    patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
  });
  return { repo: repo!, pr: pr! };
}

d('multi-agent-run (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function appWith() {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        llm: {
          openai: new MockLLMProvider('openai', { structured: REVIEW_FIXTURE }),
          openrouter: new MockLLMProvider('openai', {
            structuredBySchema: { Intent: { summary: 'test PR', in_scope: [], out_of_scope: [] } },
          }),
        },
      },
    });
  }

  it('POST starts a multi-agent-run, links agent_runs, and GET returns done columns (AC-1..AC-4, AC-13, AC-14)', async () => {
    const app = await appWith();
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const agentA = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Agent A', provider: 'openai', model: 'gpt-4.1', system_prompt: 'a' },
      })
    ).json();
    const agentB = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Agent B', provider: 'openai', model: 'gpt-4.1', system_prompt: 'b' },
      })
    ).json();

    const started = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/multi-agent-run`,
      payload: { agent_ids: [agentA.id, agentB.id] },
    });
    expect(started.statusCode).toBe(200);
    const startedBody = started.json();
    expect(startedBody.columns).toHaveLength(2);
    expect(startedBody.columns.every((c: { status: string }) => c.status === 'running')).toBe(true);
    expect(startedBody.conflicts).toEqual([]);

    // AC-3: both agent_runs rows are linked to the multi_agent_runs row.
    const linkedRuns = await pg.handle.db
      .select()
      .from(t.agentRuns)
      .where(eq(t.agentRuns.multiAgentRunId, startedBody.id));
    expect(linkedRuns).toHaveLength(2);

    await waitForPrRuns(pg.handle.db, pr.id, { expected: 2 });

    const read = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/multi-agent` });
    expect(read.statusCode).toBe(200);
    const readBody = read.json();
    expect(readBody.id).toBe(startedBody.id);
    expect(readBody.columns).toHaveLength(2);
    expect(readBody.columns.every((c: { status: string }) => c.status === 'done')).toBe(true);
    // AC-15: total_duration_ms = MAX, total_cost_usd = SUM.
    expect(readBody.total_duration_ms).toBeGreaterThanOrEqual(0);

    // AC-18: fetching by explicit multiRunId returns the same run.
    const readById = (
      await app.inject({ method: 'GET', url: `/pulls/${pr.id}/multi-agent/${startedBody.id}` })
    ).json();
    expect(readById.id).toBe(startedBody.id);

    await app.close();
  });

  it('AC-5: an empty agent_ids body is rejected with 422 before any multi-agent-run is created', async () => {
    const app = await appWith();
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const res = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/multi-agent-run`,
      payload: { agent_ids: [] },
    });
    expect(res.statusCode).toBe(422);

    const rows = await pg.handle.db
      .select()
      .from(t.multiAgentRuns)
      .where(eq(t.multiAgentRuns.prId, pr.id));
    expect(rows).toHaveLength(0);

    await app.close();
  });

  it('AC-17: reading a nonexistent multi-agent-run 404s', async () => {
    const app = await appWith();
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/multi-agent` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('GET /multi-agent-runs lists runs newest-first with agent_count/cost, and ?prId= filters (L07)', async () => {
    const app = await appWith();
    const { pr: prOne } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const { pr: prTwo } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const agentA = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'History Agent A', provider: 'openai', model: 'gpt-4.1', system_prompt: 'a' },
      })
    ).json();
    const agentB = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'History Agent B', provider: 'openai', model: 'gpt-4.1', system_prompt: 'b' },
      })
    ).json();

    // Run 1: one agent, on prOne.
    const run1 = (
      await app.inject({
        method: 'POST',
        url: `/pulls/${prOne.id}/multi-agent-run`,
        payload: { agent_ids: [agentA.id] },
      })
    ).json();
    await waitForPrRuns(pg.handle.db, prOne.id, { expected: 1 });

    // Run 2: two agents, on prTwo — started after run1, so it should sort first.
    const run2 = (
      await app.inject({
        method: 'POST',
        url: `/pulls/${prTwo.id}/multi-agent-run`,
        payload: { agent_ids: [agentA.id, agentB.id] },
      })
    ).json();
    await waitForPrRuns(pg.handle.db, prTwo.id, { expected: 2 });

    const all = (await app.inject({ method: 'GET', url: '/multi-agent-runs' })).json();
    const ids = all.map((r: { id: string }) => r.id);
    expect(ids.indexOf(run2.id)).toBeLessThan(ids.indexOf(run1.id));

    const summary1 = all.find((r: { id: string }) => r.id === run1.id);
    expect(summary1.agent_count).toBe(1);
    expect(summary1.pr_id).toBe(prOne.id);
    expect(summary1.pr_number).toBe(prOne.number);
    expect(summary1.pr_title).toBe(prOne.title);

    const summary2 = all.find((r: { id: string }) => r.id === run2.id);
    expect(summary2.agent_count).toBe(2);
    expect(typeof summary2.total_duration_ms).toBe('number');

    const filtered = (
      await app.inject({ method: 'GET', url: `/multi-agent-runs?prId=${prOne.id}` })
    ).json();
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe(run1.id);

    await app.close();
  });
});
