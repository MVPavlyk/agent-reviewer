/**
 * Intent Layer — GET/POST /pulls/:id/intent + the lazy-auto path inside a
 * full review run (Testcontainers pg). Mirrors `reviews.it.test.ts`'s style.
 *
 * Covers the plan's required test evidence:
 *  (г) exactly one `intent: classification started` log line and exactly one
 *      LLM call with `schemaName === 'Intent'` per review run.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockGitClient } from '../src/adapters/index.js';
import { ReviewService } from '../src/modules/reviews/service.js';
import * as t from '../src/db/schema.js';
import { eq } from 'drizzle-orm';

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

const REVIEW_FIXTURE = {
  verdict: 'approve',
  summary: 'looks fine',
  score: 92,
  findings: [],
};

const INTENT_FIXTURE = {
  summary: 'Rotates the Stripe secret key used by the billing worker.',
  in_scope: ['stripe secret rotation'],
  out_of_scope: ['payment retries'],
};

let repoSeq = 0;
async function setupRepoAndPr(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `intent-layer-${repoSeq++}`;
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
      title: 'Rotate Stripe secret key',
      author: 'marisa.koch',
      branch: 'feat/rotate-key',
      base: 'main',
      headSha: 'a1b2c3d4',
      additions: 1,
      deletions: 0,
      filesCount: 1,
      status: 'needs_review',
      body: 'Rotates the Stripe secret key used by the billing worker.',
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

d('Intent Layer routes + lazy-auto classification (Testcontainers pg)', () => {
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

  function appWith(openrouterLlm: MockLLMProvider) {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient({ diff: DIFF }),
        llm: {
          openai: new MockLLMProvider('openai', { structured: REVIEW_FIXTURE }),
          openrouter: openrouterLlm,
        },
      },
    });
  }

  it('GET /pulls/:id/intent → 404 before classification; POST classifies + persists; GET then returns it', async () => {
    const llm = new MockLLMProvider('openai', { structuredBySchema: { Intent: INTENT_FIXTURE } });
    const app = await appWith(llm);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const before = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` });
    expect(before.statusCode).toBe(404);

    const posted = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/intent` });
    expect(posted.statusCode).toBe(200);
    const record = posted.json();
    expect(record.summary).toBe(INTENT_FIXTURE.summary);
    expect(record.in_scope).toEqual(INTENT_FIXTURE.in_scope);
    expect(record.out_of_scope).toEqual(INTENT_FIXTURE.out_of_scope);
    expect(record.confidence).toBe('high'); // PR has a non-empty body
    expect(record.sources).toContain('title');
    expect(record.sources).toContain('description');
    expect(record.sources).toContain('file_list');
    expect(record.sources).toContain('hunk_headers');
    expect(record.provider).toBe('openrouter');
    expect(record.model).toBe('deepseek/deepseek-v4-flash');
    expect(record.pr_id).toBe(pr.id);

    const after = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` });
    expect(after.statusCode).toBe(200);
    expect(after.json()).toEqual(record);

    await app.close();
  });

  it('lazy-auto: a review run classifies intent exactly once and logs started/done exactly once', async () => {
    const llm = new MockLLMProvider('openai', { structuredBySchema: { Intent: INTENT_FIXTURE } });
    const app = await appWith(llm);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Sec', provider: 'openai', model: 'gpt-4.1', system_prompt: 'sec' },
      })
    ).json();

    const logLines: { msg: string; obj: unknown }[] = [];
    const logger = {
      info: (obj: unknown, msg?: string) => logLines.push({ msg: msg ?? '', obj }),
      warn: () => undefined,
      error: (obj: unknown, msg?: string) => logLines.push({ msg: msg ?? '', obj }),
      debug: () => undefined,
    };

    const service = new ReviewService(app.container);
    const targets = await service.resolveTargets(workspaceId, { agentId: agent.id });
    await service.runReview(workspaceId, pr.id, targets, logger);

    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });

    const started = logLines.filter((l) => l.msg === 'intent: classification started');
    const done = logLines.filter((l) => l.msg === 'intent: classification done');
    expect(started).toHaveLength(1);
    expect(done).toHaveLength(1);

    const intentCalls = llm.calls.filter(
      (c) => c.method === 'completeStructured' && (c.req as { schemaName: string }).schemaName === 'Intent',
    );
    expect(intentCalls).toHaveLength(1);

    // Persisted for future runs / the IntentCard.
    const [row] = await pg.handle.db.select().from(t.prIntent).where(eq(t.prIntent.prId, pr.id));
    expect(row?.summary).toBe(INTENT_FIXTURE.summary);

    await app.close();
  });
});
