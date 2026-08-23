/**
 * PR Brief — GET/POST /pulls/:id/brief (Testcontainers pg). Mirrors
 * `intent-routes.it.test.ts`'s style.
 *
 * Covers the plan's required test evidence:
 *  - POST → GET → POST on an unchanged PR makes exactly ONE `BriefCore` LLM
 *    call, not zero-total (a PR with no prior intent legitimately also makes
 *    one `Intent` call — AC-2 — so every count below filters
 *    `schemaName === 'BriefCore'` specifically).
 *  - `force:true` always regenerates.
 *  - a PR whose `updated_at` moved on regenerates even without `force`.
 *  - `updated_at: null` is treated as still-cached (never "always stale").
 *  - a model failure never writes a partial `pr_brief` row.
 *  - workspace scoping on both routes.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockGitClient } from '../src/adapters/index.js';
import * as t from '../src/db/schema.js';

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

const INTENT_FIXTURE = {
  summary: 'Rotates the Stripe secret key used by the billing worker.',
  in_scope: ['stripe secret rotation'],
  out_of_scope: ['payment retries'],
};

const BRIEF_FIXTURE = {
  what: 'Rotates the Stripe secret key.',
  why: 'The old key leaked in a support ticket.',
  risk_level: 'high',
  risks: [
    {
      kind: 'security',
      title: 'Rotation window',
      explanation: 'Old key stays valid briefly.',
      severity: 'high',
      file_refs: ['src/config.ts'],
    },
  ],
  review_focus: [{ file: 'src/config.ts', line: 12, reason: 'new key assignment' }],
};

let repoSeq = 0;
async function setupRepoAndPr(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `brief-layer-${repoSeq++}`;
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

function briefCalls(llm: MockLLMProvider) {
  return llm.calls.filter(
    (c) => c.method === 'completeStructured' && (c.req as { schemaName: string }).schemaName === 'BriefCore',
  );
}

d('PR Brief routes (Testcontainers pg)', () => {
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

  // `risk_brief` defaults to provider 'openai'; `review_intent` defaults to
  // 'openrouter' (see FEATURE_MODELS) — route BOTH provider ids to the SAME
  // mock instance so `llm.calls`/`briefCalls(llm)` sees every completeStructured
  // call regardless of which feature resolved which provider.
  function appWith(llm: MockLLMProvider) {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient({ diff: DIFF }),
        llm: { openai: llm, openrouter: llm },
      },
    });
  }

  it('GET → 404 before generation; POST generates; GET then returns it; a 2nd POST without force is a cache hit (AC-23, AC-26, EC-5)', async () => {
    const llm = new MockLLMProvider('openai', {
      structuredBySchema: { Intent: INTENT_FIXTURE, BriefCore: BRIEF_FIXTURE },
    });
    const app = await appWith(llm);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const before = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/brief` });
    expect(before.statusCode).toBe(404);

    const posted = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    expect(posted.statusCode).toBe(200);
    const record = posted.json();
    expect(record.what).toBe(BRIEF_FIXTURE.what);
    expect(record.risk_level).toBe('high');
    expect(record.pr_id).toBe(pr.id);
    expect(briefCalls(llm)).toHaveLength(1);

    const after = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/brief` });
    expect(after.statusCode).toBe(200);
    expect(after.json()).toEqual(record);
    expect(briefCalls(llm)).toHaveLength(1); // GET never calls the LLM (AC-26)

    const posted2 = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    expect(posted2.statusCode).toBe(200);
    expect(briefCalls(llm)).toHaveLength(1); // cache hit — zero NEW BriefCore calls

    await app.close();
  });

  it('AC-2: a PR with no prior intent classifies it too (2 total LLM calls, 1 of them BriefCore)', async () => {
    const llm = new MockLLMProvider('openai', {
      structuredBySchema: { Intent: INTENT_FIXTURE, BriefCore: BRIEF_FIXTURE },
    });
    const app = await appWith(llm);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const posted = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    expect(posted.statusCode).toBe(200);

    const intentCalls = llm.calls.filter(
      (c) => c.method === 'completeStructured' && (c.req as { schemaName: string }).schemaName === 'Intent',
    );
    expect(intentCalls).toHaveLength(1);
    expect(briefCalls(llm)).toHaveLength(1);

    const [intentRow] = await pg.handle.db.select().from(t.prIntent).where(eq(t.prIntent.prId, pr.id));
    expect(intentRow?.summary).toBe(INTENT_FIXTURE.summary);

    await app.close();
  });

  it('AC-24: {force:true} regenerates even when the cache is fresh', async () => {
    const llm = new MockLLMProvider('openai', {
      structuredBySchema: { Intent: INTENT_FIXTURE, BriefCore: BRIEF_FIXTURE },
    });
    const app = await appWith(llm);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    expect(briefCalls(llm)).toHaveLength(1);

    const forced = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/brief`,
      payload: { force: true },
    });
    expect(forced.statusCode).toBe(200);
    expect(briefCalls(llm)).toHaveLength(2);

    await app.close();
  });

  it('AC-25/EC-6: PR updated since the cached brief regenerates without force', async () => {
    const llm = new MockLLMProvider('openai', {
      structuredBySchema: { Intent: INTENT_FIXTURE, BriefCore: BRIEF_FIXTURE },
    });
    const app = await appWith(llm);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    expect(briefCalls(llm)).toHaveLength(1);

    await pg.handle.db.update(t.pullRequests).set({ updatedAt: new Date() }).where(eq(t.pullRequests.id, pr.id));

    const again = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    expect(again.statusCode).toBe(200);
    expect(briefCalls(llm)).toHaveLength(2);

    await app.close();
  });

  it('EC-7: pull_requests.updated_at = null is treated as still-cached, not always-stale', async () => {
    const llm = new MockLLMProvider('openai', {
      structuredBySchema: { Intent: INTENT_FIXTURE, BriefCore: BRIEF_FIXTURE },
    });
    const app = await appWith(llm);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    await pg.handle.db.update(t.pullRequests).set({ updatedAt: null }).where(eq(t.pullRequests.id, pr.id));

    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    expect(briefCalls(llm)).toHaveLength(1);

    const again = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    expect(again.statusCode).toBe(200);
    expect(briefCalls(llm)).toHaveLength(1); // still cached — updated_at stayed null on both sides

    await app.close();
  });

  it('AC-13/EC-9: an invalid model fixture 5xxs and leaves pr_brief unchanged; a prior cache is still readable via GET', async () => {
    const goodLlm = new MockLLMProvider('openai', {
      structuredBySchema: { Intent: INTENT_FIXTURE, BriefCore: BRIEF_FIXTURE },
    });
    const app1 = await appWith(goodLlm);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const posted = await app1.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    expect(posted.statusCode).toBe(200);
    const cached = posted.json();
    await app1.close();

    // Fresh app, LLM now returns a fixture that fails BriefCore's schema —
    // force:true so the cache hit path doesn't short-circuit before the call.
    const badLlm = new MockLLMProvider('openai', {
      structuredBySchema: { Intent: INTENT_FIXTURE, BriefCore: { nonsense: true } },
    });
    const app2 = await appWith(badLlm);
    const failed = await app2.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/brief`,
      payload: { force: true },
    });
    expect(failed.statusCode).toBeGreaterThanOrEqual(500);

    const after = await app2.inject({ method: 'GET', url: `/pulls/${pr.id}/brief` });
    expect(after.statusCode).toBe(200);
    expect(after.json()).toEqual(cached); // unchanged — the failed generation never wrote

    await app2.close();
  });

  it('EC-10: two sequential POSTs upsert into ONE pr_brief row (onConflictDoUpdate)', async () => {
    const llm = new MockLLMProvider('openai', {
      structuredBySchema: { Intent: INTENT_FIXTURE, BriefCore: BRIEF_FIXTURE },
    });
    const app = await appWith(llm);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief`, payload: { force: true } });

    const rows = await pg.handle.db.select().from(t.prBrief).where(eq(t.prBrief.prId, pr.id));
    expect(rows).toHaveLength(1);

    await app.close();
  });

  it('AC-29: a PR from another workspace 404s on both GET and POST', async () => {
    const llm = new MockLLMProvider('openai', { structuredBySchema: { BriefCore: BRIEF_FIXTURE } });
    const app = await appWith(llm);

    const [otherWs] = await pg.handle.db.insert(t.workspaces).values({ name: 'other-ws' }).returning();
    const { pr } = await setupRepoAndPr(pg.handle.db, otherWs!.id);

    const getRes = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/brief` });
    expect(getRes.statusCode).toBe(404);
    const postRes = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    expect(postRes.statusCode).toBe(404);

    await app.close();
  });

  it('empty POST body is valid (no 422) — the client CTA sends no body at all', async () => {
    const llm = new MockLLMProvider('openai', {
      structuredBySchema: { Intent: INTENT_FIXTURE, BriefCore: BRIEF_FIXTURE },
    });
    const app = await appWith(llm);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    expect(res.statusCode, res.body).toBe(200);

    await app.close();
  });

  it('AC-28: 422 on a malformed body ({force:"yes"})', async () => {
    const llm = new MockLLMProvider('openai', { structuredBySchema: { BriefCore: BRIEF_FIXTURE } });
    const app = await appWith(llm);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const res = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/brief`,
      payload: { force: 'yes' },
    });
    expect(res.statusCode).toBe(422);

    await app.close();
  });
});
