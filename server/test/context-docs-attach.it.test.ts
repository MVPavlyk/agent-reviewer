import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/index.js';
import * as t from '../src/db/schema.js';
import { ContextDocsRepository } from '../src/modules/context-docs/repository.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[context-docs-attach] Docker not available — skipping integration tests.');
}

/**
 * Крок 5 — ContextDocsRepository, exercised directly (no HTTP surface exists
 * until Крок 6). Covers SPEC-01 AC-11/AC-12/AC-13/AC-17/AC-18/AC-19.
 */
d('ContextDocsRepository', () => {
  let pg: PgFixture;
  let repo: ContextDocsRepository;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    repo = new ContextDocsRepository(pg.handle.db);
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

  async function createAgent(app: Awaited<ReturnType<typeof makeApp>>, name = 'Reviewer') {
    const res = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: {
        name,
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
    enabled = true,
  ) {
    const res = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { name, description: 'd', type: 'rubric', source: 'manual', body: 'b', enabled },
    });
    return res.json().id as string;
  }

  it('setForAgent replaces the whole set and reassigns order = index (AC-12)', async () => {
    const app = await makeApp();
    const agentId = await createAgent(app);

    const first = await repo.setForAgent(workspaceId, agentId, ['docs/a.md', 'specs/b.md']);
    expect(first).toEqual([
      expect.objectContaining({ path: 'docs/a.md', order: 0 }),
      expect.objectContaining({ path: 'specs/b.md', order: 1 }),
    ]);

    const second = await repo.setForAgent(workspaceId, agentId, ['specs/b.md']);
    expect(second).toEqual([expect.objectContaining({ path: 'specs/b.md', order: 0 })]);
    expect(await repo.listForAgent(agentId)).toHaveLength(1);
    await app.close();
  });

  it('setForSkill mirrors the same replace semantics (AC-13)', async () => {
    const app = await makeApp();
    const skillId = await createSkill(app, 'Skill for context');

    const result = await repo.setForSkill(workspaceId, skillId, ['insights/x.md', 'docs/y.md']);
    expect(result).toEqual([
      expect.objectContaining({ path: 'insights/x.md', order: 0 }),
      expect.objectContaining({ path: 'docs/y.md', order: 1 }),
    ]);
    await app.close();
  });

  it('setForAgent returns null for an agent belonging to another workspace (AC-17)', async () => {
    const [otherWs] = await pg.handle.db
      .insert(t.workspaces)
      .values({ name: 'other-context-docs' })
      .returning();
    const app = await makeApp();
    const foreignAgentId = await createAgent(app, 'Foreign agent');
    // Move the agent into the other workspace directly (simulating a foreign id).
    await pg.handle.db
      .update(t.agents)
      .set({ workspaceId: otherWs!.id })
      .where(eq(t.agents.id, foreignAgentId));

    const result = await repo.setForAgent(workspaceId, foreignAgentId, ['docs/a.md']);
    expect(result).toBeNull();
    await app.close();
  });

  it('deleting an agent cascades and removes its attached context docs (AC-18)', async () => {
    const app = await makeApp();
    const agentId = await createAgent(app, 'Deletable agent');
    await repo.setForAgent(workspaceId, agentId, ['docs/gone.md']);

    const del = await app.inject({ method: 'DELETE', url: `/agents/${agentId}` });
    expect(del.statusCode).toBe(200);

    const rows = await pg.handle.db
      .select()
      .from(t.agentContextDocs)
      .where(eq(t.agentContextDocs.agentId, agentId));
    expect(rows).toEqual([]);
    await app.close();
  });

  it('accepts a path that does not exist on disk (AC-19 — existence is never checked here)', async () => {
    const app = await makeApp();
    const agentId = await createAgent(app, 'Nonexistent-path agent');
    const result = await repo.setForAgent(workspaceId, agentId, ['specs/does-not-exist.md']);
    expect(result).toEqual([
      expect.objectContaining({ path: 'specs/does-not-exist.md', order: 0 }),
    ]);
    await app.close();
  });

  it('usedByAgents counts a doc attached directly to A and via an enabled skill to B as 2, not double-counting a single agent (AC-11)', async () => {
    const app = await makeApp();
    const agentA = await createAgent(app, 'Agent A (direct)');
    const agentB = await createAgent(app, 'Agent B (via skill)');
    const skill = await createSkill(app, 'Shared skill', true);

    const path = 'docs/shared.md';
    await repo.setForAgent(workspaceId, agentA, [path]);
    await repo.setForSkill(workspaceId, skill, [path]);
    await app.inject({
      method: 'POST',
      url: `/agents/${agentB}/skills`,
      payload: { skill_ids: [skill] },
    });
    // Agent A ALSO gets the skill linked — the direct attachment and the
    // inherited one must still count Agent A once, not twice.
    await app.inject({
      method: 'POST',
      url: `/agents/${agentA}/skills`,
      payload: { skill_ids: [skill] },
    });

    const counts = await repo.usedByAgents(workspaceId, [path]);
    expect(counts.get(path)).toBe(2);
    await app.close();
  });

  it('usedByAgents ignores an attachment via a DISABLED skill', async () => {
    const app = await makeApp();
    const agent = await createAgent(app, 'Agent C (disabled skill)');
    const skill = await createSkill(app, 'Disabled skill', false);
    const path = 'docs/disabled-skill.md';

    await repo.setForSkill(workspaceId, skill, [path]);
    await app.inject({
      method: 'POST',
      url: `/agents/${agent}/skills`,
      payload: { skill_ids: [skill] },
    });

    const counts = await repo.usedByAgents(workspaceId, [path]);
    expect(counts.get(path)).toBe(0);
    await app.close();
  });

  it('insertRunContextDocs writes attribution rows, idempotently (AC-34)', async () => {
    const app = await makeApp();
    const agentId = await createAgent(app, 'Run-attribution agent');
    const [runRow] = await pg.handle.db
      .insert(t.agentRuns)
      .values({ workspaceId, agentId, status: 'done' })
      .returning();

    const rows = [
      { path: 'docs/a.md', contentHash: 'hash-a', source: 'agent' as const },
      { path: 'specs/b.md', contentHash: null, source: 'skill' as const },
    ];
    await repo.insertRunContextDocs(runRow!.id, rows);
    await repo.insertRunContextDocs(runRow!.id, rows); // idempotent retry

    const persisted = await pg.handle.db
      .select()
      .from(t.runContextDocs)
      .where(eq(t.runContextDocs.runId, runRow!.id));
    expect(persisted).toHaveLength(2);
    await app.close();
  });
});
