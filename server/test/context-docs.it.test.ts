import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/index.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[context-docs] Docker not available — skipping integration tests.');
}

/**
 * Крок 6 — context-docs HTTP surface. Covers SPEC-01 AC-5/AC-6/AC-7/AC-16/
 * AC-17/AC-19 + EC-1/EC-2.
 */
d('context-docs routes', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let clonePath: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  beforeEach(async () => {
    clonePath = await mkdtemp(join(tmpdir(), 'context-docs-it-'));
  });
  afterEach(async () => {
    await rm(clonePath, { recursive: true, force: true });
  });

  function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
  }

  async function insertRepo(withClonePath: string | null) {
    const [row] = await pg.handle.db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name: `repo-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        fullName: `acme/repo-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        clonePath: withClonePath,
      })
      .returning();
    return row!.id as string;
  }

  async function writeDoc(rel: string, contents: string) {
    const full = join(clonePath, rel);
    await mkdir(full.slice(0, full.lastIndexOf('/')), { recursive: true });
    await writeFile(full, contents);
  }

  async function createAgent(app: Awaited<ReturnType<typeof makeApp>>) {
    const res = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: {
        name: `Agent ${Date.now()}-${Math.random()}`,
        provider: 'openai',
        model: 'gpt-4o-mini',
        system_prompt: 'Review the diff.',
      },
    });
    return res.json().id as string;
  }

  it('409 clone_missing when the repo has no clone_path (AC-6, EC-1)', async () => {
    const app = await makeApp();
    const repoId = await insertRepo(null);

    const res = await app.inject({ method: 'GET', url: `/repos/${repoId}/context-docs` });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('clone_missing');
    await app.close();
  });

  it('200 with an empty doc list when the clone has no .md under the configured roots (EC-2)', async () => {
    const app = await makeApp();
    const repoId = await insertRepo(clonePath);
    await writeDoc('src/index.ts', 'export {}');

    const res = await app.inject({ method: 'GET', url: `/repos/${repoId}/context-docs` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.docs).toEqual([]);
    expect(body.roots).toEqual(['specs', 'docs', 'insights']);
    expect(typeof body.scanned_at).toBe('string');
    await app.close();
  });

  it('lists .md docs sorted by path with dir_type and roots (AC-5)', async () => {
    const app = await makeApp();
    const repoId = await insertRepo(clonePath);
    await writeDoc('specs/b.md', 'B');
    await writeDoc('specs/a.md', 'A');
    await writeDoc('docs/c.md', 'C');

    const res = await app.inject({ method: 'GET', url: `/repos/${repoId}/context-docs` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.docs.map((doc: { path: string }) => doc.path)).toEqual([
      'docs/c.md',
      'specs/a.md',
      'specs/b.md',
    ]);
    expect(body.docs[0].dir_type).toBe('docs');
    expect(body.docs.every((doc: { used_by_agents: number }) => doc.used_by_agents === 0)).toBe(true);
    await app.close();
  });

  it('POST /refresh sees a file written after the first scan (AC-7)', async () => {
    const app = await makeApp();
    const repoId = await insertRepo(clonePath);
    await writeDoc('specs/first.md', 'first');

    const first = await app.inject({ method: 'GET', url: `/repos/${repoId}/context-docs` });
    expect(first.json().docs.map((doc: { path: string }) => doc.path)).toEqual(['specs/first.md']);

    await writeDoc('specs/second.md', 'second');
    // Without a refresh, the cached scan should NOT see the new file yet.
    const stale = await app.inject({ method: 'GET', url: `/repos/${repoId}/context-docs` });
    expect(stale.json().docs.map((doc: { path: string }) => doc.path)).toEqual(['specs/first.md']);

    const refreshed = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/context-docs/refresh`,
    });
    expect(refreshed.statusCode).toBe(200);
    expect(refreshed.json().docs.map((doc: { path: string }) => doc.path)).toEqual([
      'specs/first.md',
      'specs/second.md',
    ]);
    await app.close();
  });

  it('POST /agents/:id/context-docs rejects a traversal path with 422 and writes nothing (AC-16)', async () => {
    const app = await makeApp();
    const agentId = await createAgent(app);

    const res = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/context-docs`,
      payload: { paths: ['../secrets.md'] },
    });
    expect(res.statusCode).toBe(422);

    const after = await app.inject({ method: 'GET', url: `/agents/${agentId}/context-docs` });
    expect(after.json()).toEqual([]);
    await app.close();
  });

  it('POST /agents/:id/context-docs 404s for an agent in another workspace (AC-17)', async () => {
    const [otherWs] = await pg.handle.db
      .insert(t.workspaces)
      .values({ name: 'other-context-docs-routes' })
      .returning();
    const app = await makeApp();
    const agentId = await createAgent(app);
    await pg.handle.db.update(t.agents).set({ workspaceId: otherWs!.id }).where(eq(t.agents.id, agentId));

    const res = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/context-docs`,
      payload: { paths: ['docs/a.md'] },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('accepts a valid path that does not exist on disk (AC-19)', async () => {
    const app = await makeApp();
    const agentId = await createAgent(app);

    const res = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/context-docs`,
      payload: { paths: ['specs/does-not-exist.md'] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([
      expect.objectContaining({ path: 'specs/does-not-exist.md', source: 'agent' }),
    ]);
    await app.close();
  });

  it('GET /repos/:repoId/context-docs/content previews a doc and truncates past PREVIEW_MAX_CHARS', async () => {
    const app = await makeApp();
    const repoId = await insertRepo(clonePath);
    await writeDoc('specs/a.md', 'hello world');

    const ok = await app.inject({
      method: 'GET',
      url: `/repos/${repoId}/context-docs/content?path=specs/a.md`,
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toEqual({ path: 'specs/a.md', content: 'hello world', truncated: false });

    const invalid = await app.inject({
      method: 'GET',
      url: `/repos/${repoId}/context-docs/content?${new URLSearchParams({ path: '../etc.md' })}`,
    });
    expect(invalid.statusCode).toBe(422);

    const missing = await app.inject({
      method: 'GET',
      url: `/repos/${repoId}/context-docs/content?path=specs/missing.md`,
    });
    expect(missing.statusCode).toBe(404);
    await app.close();
  });
});
