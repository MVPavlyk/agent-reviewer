import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/index.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[skills-versions] Docker not available — skipping integration tests.');
}

/**
 * Skills — versions + restore (docs/specs/skills.md Extension, decision E2):
 * `GET /skills/:id/versions` lists body snapshots newest-first; restoring an
 * older version COPIES it FORWARD as a brand-new version, never overwrites.
 */
d('skills versions + restore', () => {
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

  const createBody = {
    name: 'Restorable Rubric',
    description: 'd',
    type: 'rubric' as const,
    source: 'manual' as const,
    body: 'v1 body',
  };

  async function createSkillWithHistory(app: Awaited<ReturnType<typeof makeApp>>) {
    const created = (
      await app.inject({ method: 'POST', url: '/skills', payload: createBody })
    ).json();
    await app.inject({
      method: 'PUT',
      url: `/skills/${created.id}`,
      payload: { body: 'v2 body', change_summary: 'tightened wording' },
    });
    await app.inject({
      method: 'PUT',
      url: `/skills/${created.id}`,
      payload: { body: 'v3 body' },
    });
    return created.id as string;
  }

  it('GET /skills/:id/versions → newest first, with the user-entered change_summary', async () => {
    const app = await makeApp();
    const id = await createSkillWithHistory(app);

    const res = await app.inject({ method: 'GET', url: `/skills/${id}/versions` });
    expect(res.statusCode).toBe(200);
    const versions = res.json();
    expect(versions.map((v: { version: number }) => v.version)).toEqual([3, 2, 1]);
    expect(versions.find((v: { version: number }) => v.version === 2).change_summary).toBe(
      'tightened wording',
    );
    expect(versions.find((v: { version: number }) => v.version === 1).change_summary).toBeNull();
    await app.close();
  });

  it('GET /skills/:id/versions → 404 for an unknown skill', async () => {
    const app = await makeApp();
    const ghost = '00000000-0000-0000-0000-000000000000';
    const res = await app.inject({ method: 'GET', url: `/skills/${ghost}/versions` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('restore is copy-forward: current v3, restoring v1 creates v4 with v1s body', async () => {
    const app = await makeApp();
    const id = await createSkillWithHistory(app);

    const restored = await app.inject({
      method: 'POST',
      url: `/skills/${id}/versions/1/restore`,
    });
    expect(restored.statusCode).toBe(200);
    const skill = restored.json();
    expect(skill.version).toBe(4);
    expect(skill.body).toBe('v1 body');

    const versions = (
      await app.inject({ method: 'GET', url: `/skills/${id}/versions` })
    ).json();
    expect(versions.map((v: { version: number }) => v.version)).toEqual([4, 3, 2, 1]);
    // v1's original snapshot is untouched — restore never overwrites history.
    expect(versions.find((v: { version: number }) => v.version === 1).body).toBe('v1 body');
    await app.close();
  });

  it('restoring an unknown version → 404', async () => {
    const app = await makeApp();
    const id = await createSkillWithHistory(app);
    const res = await app.inject({ method: 'POST', url: `/skills/${id}/versions/99/restore` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
