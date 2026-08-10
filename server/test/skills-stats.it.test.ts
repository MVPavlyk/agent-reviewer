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

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[skills-stats] Docker not available — skipping integration tests.');
}

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

// One grounded finding (line 11 IS in the diff hunk) so it survives the
// citation gate — keeps findings_count deterministic for the cost split.
const REVIEW_FIXTURE: Review = {
  verdict: 'request_changes',
  summary: 'Hardcoded secret.',
  score: 40,
  findings: [
    {
      id: 'f-1',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Hardcoded Stripe secret key',
      file: 'src/config.ts',
      start_line: 11,
      end_line: 11,
      rationale: 'A live Stripe key is committed in source.',
      confidence: 0.95,
      kind: 'finding',
    },
  ],
};

/**
 * End-to-end proof of the Stats tab's data path (docs/specs/skills.md
 * Extension): a real run through `run_skills` attribution, an accepted
 * finding, and MockLLMProvider's fixed `cost_usd: 0.001` — asserting
 * `GET /skills/:id/stats` reflects it (approximate, per decision E4).
 */
d('skills stats — end to end', () => {
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

  function makeApp() {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        llm: { openai: new MockLLMProvider('openai', { structured: REVIEW_FIXTURE }) },
      },
    });
  }

  it('reflects agents_count/pull_rate/accept_rate and the findings-by-category cost split', async () => {
    const app = await makeApp();

    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'skills-stats-repo', fullName: 'acme/skills-stats-repo' })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 1,
        title: 'Some change',
        author: 'dev',
        branch: 'feat/x',
        base: 'main',
        headSha: 'a1b2c3d4',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
        body: null,
      })
      .returning();
    await pg.handle.db.insert(t.prFiles).values({
      prId: pr!.id,
      path: 'src/config.ts',
      additions: 1,
      deletions: 0,
      patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
    });

    const agentId = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Stats Reviewer', provider: 'openai', model: 'gpt-4.1', system_prompt: 'Review.' },
      })
    ).json().id as string;

    const skillId = (
      await app.inject({
        method: 'POST',
        url: '/skills',
        payload: {
          name: 'Secret Scan Rubric',
          description: 'd',
          type: 'security',
          source: 'manual',
          body: 'Flag any hardcoded secret.',
          enabled: true,
        },
      })
    ).json().id as string;

    await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: { skill_ids: [skillId] },
    });

    const runRes = await app.inject({
      method: 'POST',
      url: `/pulls/${pr!.id}/review`,
      payload: { agentId },
    });
    await waitForPrRuns(pg.handle.db, pr!.id, { expected: 1, timeoutMs: 30_000 });

    const findings = await pg.handle.db
      .select()
      .from(t.findings)
      .innerJoin(t.reviews, eq(t.reviews.id, t.findings.reviewId))
      .where(eq(t.reviews.prId, pr!.id));
    expect(findings).toHaveLength(1);
    await app.inject({ method: 'POST', url: `/findings/${findings[0]!.findings.id}/accept` });

    const stats = await app.inject({ method: 'GET', url: `/skills/${skillId}/stats` });
    expect(stats.statusCode).toBe(200);
    const body = stats.json();
    expect(body.agents_count).toBe(1);
    expect(body.pull_rate).toBe(1);
    expect(body.accept_rate).toBe(1);
    expect(body.window_days).toBe(30);
    expect(body.findings_by_category).toEqual([
      { category: 'security', count: 1, cost_usd: 0.001 },
    ]);
    expect(body.total_cost_usd).toBeCloseTo(0.001);

    void runRes;
    await app.close();
  });

  it('pull_rate ignores an agent run that predates the skill (createdAt floor)', async () => {
    const app = await makeApp();

    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'skills-stats-floor-repo', fullName: 'acme/skills-stats-floor-repo' })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 1,
        title: 'Some change',
        author: 'dev',
        branch: 'feat/x',
        base: 'main',
        headSha: 'a1b2c3d4',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
        body: null,
      })
      .returning();
    await pg.handle.db.insert(t.prFiles).values({
      prId: pr!.id,
      path: 'src/config.ts',
      additions: 1,
      deletions: 0,
      patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
    });

    const agentId = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Pre-existing Reviewer', provider: 'openai', model: 'gpt-4.1', system_prompt: 'Review.' },
      })
    ).json().id as string;

    // Run #1 — happens BEFORE the skill exists at all (no attach possible yet).
    await app.inject({ method: 'POST', url: `/pulls/${pr!.id}/review`, payload: { agentId } });
    await waitForPrRuns(pg.handle.db, pr!.id, { expected: 1, timeoutMs: 30_000 });

    const skillId = (
      await app.inject({
        method: 'POST',
        url: '/skills',
        payload: {
          name: 'Late-Linked Rubric',
          description: 'd',
          type: 'security',
          source: 'manual',
          body: 'Flag any hardcoded secret.',
          enabled: true,
        },
      })
    ).json().id as string;
    await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: { skill_ids: [skillId] },
    });

    // Run #2 — after the skill exists and is linked+enabled.
    await app.inject({ method: 'POST', url: `/pulls/${pr!.id}/review`, payload: { agentId } });
    await waitForPrRuns(pg.handle.db, pr!.id, { expected: 2, timeoutMs: 30_000 });

    const stats = (await app.inject({ method: 'GET', url: `/skills/${skillId}/stats` })).json();
    // Without the createdAt floor this would be 1/2 = 0.5 (run #1 counted
    // against a skill it couldn't possibly have been attached to yet).
    expect(stats.pull_rate).toBe(1);
    await app.close();
  });

  it('404 for an unknown skill', async () => {
    const app = await makeApp();
    const ghost = '00000000-0000-0000-0000-000000000000';
    const res = await app.inject({ method: 'GET', url: `/skills/${ghost}/stats` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
