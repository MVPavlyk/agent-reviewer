import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/index.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[agent-skills] Docker not available — skipping integration tests.');
}

/**
 * Agent ↔ skill linking (A2 route, A1 data). Covers link, reorder, repeated
 * `setSkills` stability, and the cross-workspace hole from
 * docs/specs/skills.md correction 2: a skill belonging to another workspace
 * must never be linkable to this workspace's agent.
 */
d('agent-skills linking', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
  }

  async function createAgent(app: Awaited<ReturnType<typeof makeApp>>) {
    const res = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: {
        name: 'Reviewer',
        provider: 'openai',
        model: 'gpt-4o-mini',
        system_prompt: 'Review the diff.',
      },
    });
    return res.json().id as string;
  }

  async function createSkill(
    app: Awaited<ReturnType<typeof makeApp>>,
    name = 'Skill A',
  ) {
    const res = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: {
        name,
        description: 'd',
        type: 'rubric',
        source: 'manual',
        body: 'b',
      },
    });
    return res.json().id as string;
  }

  it('links a skill and reorders via setSkills; repeated calls are stable', async () => {
    const app = await makeApp();
    const agentId = await createAgent(app);
    const s1 = await createSkill(app, 'Skill 1');
    const s2 = await createSkill(app, 'Skill 2');

    const linked = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: { skill_ids: [s1, s2] },
    });
    expect(linked.statusCode).toBe(200);
    expect(linked.json()).toEqual([
      { agent_id: agentId, skill_id: s1, order: 0 },
      { agent_id: agentId, skill_id: s2, order: 1 },
    ]);

    const reordered = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: { skill_ids: [s2, s1] },
    });
    expect(reordered.json()).toEqual([
      { agent_id: agentId, skill_id: s2, order: 0 },
      { agent_id: agentId, skill_id: s1, order: 1 },
    ]);

    // Repeated identical call is stable (idempotent).
    const again = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: { skill_ids: [s2, s1] },
    });
    expect(again.json()).toEqual(reordered.json());
    await app.close();
  });

  it('a skill from another workspace is rejected by setSkills (dropped, not linked)', async () => {
    const { db } = pg.handle;
    const [otherWs] = await db
      .insert(t.workspaces)
      .values({ name: 'other-agent-skills' })
      .returning();
    const [foreignSkill] = await db
      .insert(t.skills)
      .values({
        workspaceId: otherWs!.id,
        name: 'Foreign',
        description: 'd',
        type: 'custom',
        source: 'manual',
        body: 'b',
      })
      .returning();

    const app = await makeApp();
    const agentId = await createAgent(app);
    const ownSkill = await createSkill(app, 'Own Skill');

    const res = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: { skill_ids: [ownSkill, foreignSkill!.id] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([{ agent_id: agentId, skill_id: ownSkill, order: 0 }]);
    await app.close();
  });

  it('a skill from another workspace is rejected by the single-link form (skill_id)', async () => {
    const { db } = pg.handle;
    const [otherWs] = await db
      .insert(t.workspaces)
      .values({ name: 'other-agent-skills-2' })
      .returning();
    const [foreignSkill] = await db
      .insert(t.skills)
      .values({
        workspaceId: otherWs!.id,
        name: 'Foreign 2',
        description: 'd',
        type: 'custom',
        source: 'manual',
        body: 'b',
      })
      .returning();

    const app = await makeApp();
    const agentId = await createAgent(app);

    const res = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: { skill_id: foreignSkill!.id },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
    await app.close();
  });
});
