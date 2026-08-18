/**
 * GET /pulls/:id/blast — harness mirrors smart-diff.it.test.ts.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitHubClient } from '../src/adapters';
import * as t from '../src/db/schema.js';
import { INDEXER_VERSION } from '../src/modules/repo-intel/constants.js';
import { BlastRadius } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

let repoSeq = 0;
async function setupRepoAndPr(
  db: PgFixture['handle']['db'],
  workspaceId: string,
  number: number,
  filesCount = 1,
) {
  const name = `blast-route-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number,
      title: 'Add rate limiting',
      author: 'marisa.koch',
      branch: 'feat/rl',
      base: 'main',
      headSha: 'a1b2c3d4',
      additions: 10,
      deletions: 2,
      filesCount,
      status: 'open',
    })
    .returning();
  return { repo: repo!, pr: pr! };
}

d('GET /pulls/:id/blast (Testcontainers pg)', () => {
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

  it('returns 200 with a valid BlastRadius body', async () => {
    const gh = new MockGitHubClient({ pulls: [] });
    const app = await buildApp({ config: config(), db: pg.handle.db, overrides: { github: gh } });
    const { repo, pr } = await setupRepoAndPr(pg.handle.db, workspaceId, 701);

    await pg.handle.db
      .insert(t.prFiles)
      .values([{ prId: pr.id, path: 'src/a.ts', additions: 5, deletions: 1, patch: '' }]);
    await pg.handle.db.insert(t.repoIndexState).values({
      repoId: repo.id,
      lastIndexedSha: 'sha1',
      indexerVersion: INDEXER_VERSION,
      status: 'full',
      filesIndexed: 1,
      filesSkipped: 0,
    });
    await pg.handle.db.insert(t.symbols).values([
      { repoId: repo.id, path: 'src/a.ts', name: 'rateLimit', kind: 'function', line: 1, exported: true },
    ]);

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/blast` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as BlastRadius;
    expect(() => BlastRadius.parse(body)).not.toThrow();
    expect(body.status).toBe('ok');
    expect(body.head_sha).toBe('a1b2c3d4');
  });

  it('reports diff_not_loaded (not ok) when pr_files is empty but GitHub reports files', async () => {
    const gh = new MockGitHubClient({ pulls: [] });
    const app = await buildApp({ config: config(), db: pg.handle.db, overrides: { github: gh } });
    // filesCount > 0 (GitHub says this PR touches files) but no `pr_files`
    // rows inserted — the PR's own detail page was never opened, so its diff
    // was never fetched. Must NOT read as "ok, zero impact".
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId, 702, 12);

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/blast` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as BlastRadius;
    expect(() => BlastRadius.parse(body)).not.toThrow();
    expect(body.status).toBe('degraded');
    expect(body.reason).toBe('diff_not_loaded');
    expect(body.message).not.toBe('');
  });

  it('reports ok (not degraded) when a PR genuinely has zero files', async () => {
    const gh = new MockGitHubClient({ pulls: [] });
    const app = await buildApp({ config: config(), db: pg.handle.db, overrides: { github: gh } });
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId, 703, 0);

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/blast` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as BlastRadius;
    expect(body.status).toBe('ok');
  });

  it('returns 404 for an unknown (but valid-uuid) PR', async () => {
    const gh = new MockGitHubClient({ pulls: [] });
    const app = await buildApp({ config: config(), db: pg.handle.db, overrides: { github: gh } });
    const res = await app.inject({
      method: 'GET',
      url: '/pulls/00000000-0000-0000-0000-000000000000/blast',
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 422 for a non-uuid :id', async () => {
    const gh = new MockGitHubClient({ pulls: [] });
    const app = await buildApp({ config: config(), db: pg.handle.db, overrides: { github: gh } });
    const res = await app.inject({ method: 'GET', url: '/pulls/not-a-uuid/blast' });
    expect(res.statusCode).toBe(422);
  });
});
