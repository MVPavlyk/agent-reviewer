/**
 * GET /repos/:id/pulls — the severity-breakdown rollup (`findingsByPr` in
 * modules/pulls/routes.ts, built on `rollupSeverities` from status.ts). Mirrors
 * `pulls-comments.it.test.ts`'s harness. The `costByPr` SUM aggregate on the
 * same handler still has no integration coverage — a pre-existing gap, not
 * something this file tries to close.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitHubClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { PrMeta } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

let repoSeq = 0;
async function setupRepoAndPr(db: PgFixture['handle']['db'], workspaceId: string, number: number) {
  const name = `findings-list-${repoSeq++}`;
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
      filesCount: 1,
      status: 'open',
    })
    .returning();
  return { repo: repo!, pr: pr! };
}

d('GET /repos/:id/pulls — findings severity rollup (Testcontainers pg)', () => {
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

  it('excludes dismissed findings and ignores summary-kind reviews', async () => {
    const gh = new MockGitHubClient({ pulls: [] }); // don't sync unrelated fixture PRs
    const app = await buildApp({ config: config(), db: pg.handle.db, overrides: { github: gh } });
    const { repo, pr } = await setupRepoAndPr(pg.handle.db, workspaceId, 501);

    const [review] = await pg.handle.db
      .insert(t.reviews)
      .values({ workspaceId, prId: pr.id, kind: 'review', verdict: 'request_changes', score: 40 })
      .returning();
    const [summary] = await pg.handle.db
      .insert(t.reviews)
      .values({ workspaceId, prId: pr.id, kind: 'summary' })
      .returning();

    await pg.handle.db.insert(t.findings).values([
      {
        reviewId: review!.id,
        file: 'src/config.ts',
        startLine: 1,
        endLine: 1,
        severity: 'CRITICAL',
        category: 'security',
        title: 'Hardcoded secret',
        rationale: 'A live key is committed.',
        confidence: 0.95,
      },
      {
        reviewId: review!.id,
        file: 'src/config.ts',
        startLine: 2,
        endLine: 2,
        severity: 'WARNING',
        category: 'bug',
        title: 'Dismissed warning',
        rationale: 'Reviewer decided this is fine.',
        confidence: 0.7,
        dismissedAt: new Date(),
      },
      {
        // Attached to the summary review — must not be counted (kind: 'review' only).
        reviewId: summary!.id,
        file: 'src/config.ts',
        startLine: 3,
        endLine: 3,
        severity: 'SUGGESTION',
        category: 'style',
        title: 'From a summary review',
        rationale: 'Should be excluded.',
        confidence: 0.5,
      },
    ]);

    const res = await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as PrMeta[];
    const row = body.find((p) => p.id === pr.id);
    expect(row?.findings).toEqual({ critical: 1, warning: 0, suggestion: 0 });
  });

  it('is null for a PR with no findings', async () => {
    const gh = new MockGitHubClient({ pulls: [] });
    const app = await buildApp({ config: config(), db: pg.handle.db, overrides: { github: gh } });
    const { repo, pr } = await setupRepoAndPr(pg.handle.db, workspaceId, 502);

    const res = await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as PrMeta[];
    const row = body.find((p) => p.id === pr.id);
    expect(row?.findings ?? null).toBeNull();
  });
});
