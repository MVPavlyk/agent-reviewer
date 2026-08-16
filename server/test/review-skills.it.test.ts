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
  console.warn('[review-skills] Docker not available — skipping integration tests.');
}

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

const REVIEW_FIXTURE: Review = {
  verdict: 'approve',
  summary: 'Looks fine.',
  score: 100,
  findings: [],
};

let repoSeq = 0;
async function setupRepoAndPr(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `skills-review-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
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
  await db.insert(t.prFiles).values({
    prId: pr!.id,
    path: 'src/config.ts',
    additions: 1,
    deletions: 0,
    patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
  });
  return { repo: repo!, pr: pr! };
}

/**
 * The test that proves the headline acceptance criterion (docs/specs/skills.md
 * PR 2): an enabled skill linked to an agent reaches the persisted
 * `run_traces.prompt_assembly.skills` as its own block; a disabled one does
 * not; and the field is null when the agent has no enabled skills at all.
 */
d('review-skills — prompt_assembly.skills', () => {
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
        llm: {
          openai: new MockLLMProvider('openai', { structured: REVIEW_FIXTURE }),
          // Intent Layer's lazy-auto classification defaults to 'openrouter' —
          // mock it so these tests never attempt a real network call.
          openrouter: new MockLLMProvider('openai', {
            structuredBySchema: {
              Intent: { summary: 'test PR', in_scope: [], out_of_scope: [] },
            },
          }),
        },
      },
    });
  }

  async function createAgent(app: Awaited<ReturnType<typeof makeApp>>) {
    const res = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: { name: 'Skilled Reviewer', provider: 'openai', model: 'gpt-4.1', system_prompt: 'Review.' },
    });
    return res.json().id as string;
  }

  async function createSkill(
    app: Awaited<ReturnType<typeof makeApp>>,
    name: string,
    enabled: boolean,
  ) {
    const res = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: {
        name,
        description: 'd',
        type: 'rubric',
        source: 'manual',
        body: `Rubric body for ${name}.`,
        enabled,
      },
    });
    return res.json().id as string;
  }

  async function runReview(
    app: Awaited<ReturnType<typeof makeApp>>,
    prId: string,
    agentId: string,
  ) {
    // waitForPrRuns polls ALL agent_runs for this PR, so a second call on the
    // same PR (e.g. the "toggle then re-run" test) must wait for one MORE
    // terminal run than already existed, not just "at least 1".
    const before = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.prId, prId));
    const res = await app.inject({
      method: 'POST',
      url: `/pulls/${prId}/review`,
      payload: { agentId },
    });
    const runId = res.json().runs[0].run_id as string;
    // A generous timeout: under a full-suite run, many Testcontainers-backed
    // files execute concurrently and CPU contention can push a single mock-LLM
    // review run past the helper's 10s default.
    await waitForPrRuns(pg.handle.db, prId, { expected: before.length + 1, timeoutMs: 30_000 });
    const trace = (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json();
    return trace;
  }

  it('an enabled skill appears as its own block; a disabled one does not', async () => {
    const app = await makeApp();
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agentId = await createAgent(app);
    const enabledId = await createSkill(app, 'Enabled Skill', true);
    const disabledId = await createSkill(app, 'Disabled Skill', false);

    await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: { skill_ids: [enabledId, disabledId] },
    });

    const trace = await runReview(app, pr.id, agentId);
    expect(trace.prompt_assembly.skills).toContain('Enabled Skill');
    expect(trace.prompt_assembly.skills).not.toContain('Disabled Skill');
    await app.close();
  });

  it('is null when the agent has no enabled skills', async () => {
    const app = await makeApp();
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agentId = await createAgent(app);
    const disabledId = await createSkill(app, 'Only Disabled', false);

    await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: { skill_ids: [disabledId] },
    });

    const trace = await runReview(app, pr.id, agentId);
    expect(trace.prompt_assembly.skills).toBeNull();
    await app.close();
  });

  it('is null when the agent has no linked skills at all', async () => {
    const app = await makeApp();
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agentId = await createAgent(app);

    const trace = await runReview(app, pr.id, agentId);
    expect(trace.prompt_assembly.skills).toBeNull();
    await app.close();
  });

  it('toggling skills.enabled off (link intact) removes it from the next run', async () => {
    const app = await makeApp();
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agentId = await createAgent(app);
    const skillId = await createSkill(app, 'Togglable Skill', true);
    await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: { skill_ids: [skillId] },
    });

    const before = await runReview(app, pr.id, agentId);
    expect(before.prompt_assembly.skills).toContain('Togglable Skill');

    await app.inject({ method: 'PUT', url: `/skills/${skillId}`, payload: { enabled: false } });

    // The link is untouched — only the skill's own `enabled` flag changed.
    const links = (await app.inject({ method: 'GET', url: `/agents/${agentId}/skills` })).json();
    expect(links).toEqual([{ agent_id: agentId, skill_id: skillId, order: 0 }]);

    const after = await runReview(app, pr.id, agentId);
    expect(after.prompt_assembly.skills).toBeNull();
    await app.close();
  });

  it('persists a run_skills row (skill + version snapshot) per enabled skill, none for a disabled one', async () => {
    const app = await makeApp();
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agentId = await createAgent(app);
    const enabledId = await createSkill(app, 'Attributed Skill', true);
    const disabledId = await createSkill(app, 'Not Attributed', false);
    await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: { skill_ids: [enabledId, disabledId] },
    });

    const before = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.prId, pr.id));
    const res = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/review`,
      payload: { agentId },
    });
    const runId = res.json().runs[0].run_id as string;
    await waitForPrRuns(pg.handle.db, pr.id, { expected: before.length + 1, timeoutMs: 30_000 });

    const runSkillRows = await pg.handle.db
      .select()
      .from(t.runSkills)
      .where(eq(t.runSkills.runId, runId));
    expect(runSkillRows).toEqual([{ runId, skillId: enabledId, skillVersion: 1 }]);
    await app.close();
  });
});
