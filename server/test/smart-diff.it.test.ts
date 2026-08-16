/**
 * GET /pulls/:id/smart-diff — deterministic classification + latest-review
 * finding lines. Harness mirrors `pulls-list.it.test.ts`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitHubClient } from '../src/adapters';
import * as t from '../src/db/schema.js';
import type { SmartDiff } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

let repoSeq = 0;
async function setupRepoAndPr(db: PgFixture['handle']['db'], workspaceId: string, number: number) {
  const name = `smart-diff-${repoSeq++}`;
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
      filesCount: 3,
      status: 'open',
    })
    .returning();
  return { repo: repo!, pr: pr! };
}

d('GET /pulls/:id/smart-diff (Testcontainers pg)', () => {
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

  it('returns 404 for a non-existent PR', async () => {
    const gh = new MockGitHubClient({ pulls: [] });
    const app = await buildApp({ config: config(), db: pg.handle.db, overrides: { github: gh } });
    const res = await app.inject({
      method: 'GET',
      url: '/pulls/00000000-0000-0000-0000-000000000000/smart-diff',
    });
    expect(res.statusCode).toBe(404);
  });

  it('groups files, attaches finding_lines from the latest review, and excludes dismissed findings', async () => {
    const gh = new MockGitHubClient({ pulls: [] });
    const app = await buildApp({ config: config(), db: pg.handle.db, overrides: { github: gh } });
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId, 601);

    await pg.handle.db.insert(t.prFiles).values([
      { prId: pr.id, path: 'src/modules/pulls/service.ts', additions: 20, deletions: 3, patch: '' },
      { prId: pr.id, path: 'src/modules/index.ts', additions: 2, deletions: 0, patch: '' },
      { prId: pr.id, path: 'pnpm-lock.yaml', additions: 50, deletions: 0, patch: '' },
    ]);

    const [review] = await pg.handle.db
      .insert(t.reviews)
      .values({ workspaceId, prId: pr.id, kind: 'review', verdict: 'request_changes', score: 40 })
      .returning();

    await pg.handle.db.insert(t.findings).values([
      {
        reviewId: review!.id,
        file: 'src/modules/pulls/service.ts',
        startLine: 10,
        endLine: 12,
        severity: 'CRITICAL',
        category: 'bug',
        title: 'Kept finding',
        rationale: 'Real issue.',
        confidence: 0.9,
      },
      {
        reviewId: review!.id,
        file: 'src/modules/pulls/service.ts',
        startLine: 99,
        endLine: 99,
        severity: 'WARNING',
        category: 'style',
        title: 'Dismissed finding',
        rationale: 'Reviewer decided this is fine.',
        confidence: 0.7,
        dismissedAt: new Date(),
      },
    ]);

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/smart-diff` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as SmartDiff;

    expect(body.groups.map((g) => g.role)).toEqual(['core', 'wiring', 'boilerplate']);

    const core = body.groups.find((g) => g.role === 'core')!;
    const service = core.files.find((f) => f.path === 'src/modules/pulls/service.ts')!;
    expect(service.finding_lines).toEqual([10, 11, 12]);

    const wiring = body.groups.find((g) => g.role === 'wiring')!;
    expect(wiring.files.map((f) => f.path)).toEqual(['src/modules/index.ts']);

    const boilerplate = body.groups.find((g) => g.role === 'boilerplate')!;
    expect(boilerplate.files.map((f) => f.path)).toEqual(['pnpm-lock.yaml']);
  });

  it('returns empty finding_lines for a PR that has not been reviewed yet', async () => {
    const gh = new MockGitHubClient({ pulls: [] });
    const app = await buildApp({ config: config(), db: pg.handle.db, overrides: { github: gh } });
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId, 602);

    await pg.handle.db
      .insert(t.prFiles)
      .values([{ prId: pr.id, path: 'src/service.ts', additions: 5, deletions: 1, patch: '' }]);

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/smart-diff` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as SmartDiff;
    const core = body.groups.find((g) => g.role === 'core')!;
    expect(core.files[0]!.finding_lines).toEqual([]);
  });
});
