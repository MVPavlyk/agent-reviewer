/**
 * POST /findings/:id/eval-case (Крок 8, SPEC-05) — Testcontainers pg.
 *
 * Findings/reviews/PR are inserted directly via Drizzle (not through a real
 * review run) so each of the six branches is set up deterministically:
 * accepted, dismissed, unresolved (422), wrong `kind` (422), PR with no
 * patch for the finding's file (422, 0 rows), repeated call (idempotent —
 * same case_id), and a foreign-workspace finding (404).
 *
 * Run in isolation per the plan (§6, R-3): `pnpm exec vitest run eval-cases.it.test`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

/** newStart=1, newLines=6 → covers new lines 1-6. */
const PATCH = [
  '@@ -1,3 +1,6 @@',
  ' export async function listUsers(ids) {',
  '-  return ids.map((id) => db.users.findOne(id));',
  '+  const users = [];',
  '+  for (const id of ids) {',
  '+    users.push(await db.users.findOne(id));',
  '+  }',
  '+  return users;',
  ' }',
].join('\n');

let repoSeq = 0;
async function setupRepoAndPr(
  db: PgFixture['handle']['db'],
  workspaceId: string,
  opts: { withPatch?: boolean } = {},
) {
  const name = `eval-cases-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 1000 + repoSeq,
      title: 'Batch fetch users',
      author: 'marisa.koch',
      branch: 'feat/batch-users',
      base: 'main',
      headSha: 'a1b2c3d4',
      additions: 6,
      deletions: 1,
      filesCount: 1,
      status: 'needs_review',
      body: 'Batches the user lookup.',
    })
    .returning();
  await db.insert(t.prFiles).values({
    prId: pr!.id,
    path: 'src/api/users.ts',
    additions: 5,
    deletions: 1,
    patch: opts.withPatch === false ? null : PATCH,
  });
  return { repo: repo!, pr: pr! };
}

async function insertReview(
  db: PgFixture['handle']['db'],
  workspaceId: string,
  prId: string,
  agentId: string | null,
) {
  const [review] = await db
    .insert(t.reviews)
    .values({ workspaceId, prId, agentId, kind: 'review', verdict: 'comment', model: 'seed' })
    .returning();
  return review!;
}

async function insertFinding(
  db: PgFixture['handle']['db'],
  reviewId: string,
  overrides: Partial<typeof t.findings.$inferInsert> = {},
) {
  const [row] = await db
    .insert(t.findings)
    .values({
      reviewId,
      file: 'src/api/users.ts',
      startLine: 2,
      endLine: 4,
      severity: 'WARNING',
      category: 'perf',
      title: 'N+1 query in user list endpoint',
      rationale: 'Loop issues one query per user.',
      confidence: 0.8,
      kind: 'finding',
      ...overrides,
    })
    .returning();
  return row!;
}

d('POST /findings/:id/eval-case (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let agentId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    const [agent] = await pg.handle.db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, 'General Reviewer')));
    agentId = agent!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function buildTestApp() {
    return buildApp({ config: config(), db: pg.handle.db });
  }

  async function countCases(): Promise<number> {
    const rows = await pg.handle.db.select().from(t.evalCases);
    return rows.length;
  }

  it('accepted finding → 201 with a case whose expected_output has 1 element + input_meta.source_finding', async () => {
    const app = await buildTestApp();
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const review = await insertReview(pg.handle.db, workspaceId, pr.id, agentId);
    const finding = await insertFinding(pg.handle.db, review.id, { acceptedAt: new Date() });

    const before = await countCases();
    const res = await app.inject({ method: 'POST', url: `/findings/${finding.id}/eval-case` });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.case_id).toBeTruthy();

    const [row] = await pg.handle.db
      .select()
      .from(t.evalCases)
      .where(eq(t.evalCases.id, body.case_id));
    expect(row!.ownerKind).toBe('agent');
    expect(row!.ownerId).toBe(agentId);
    expect(row!.expectedOutput).toHaveLength(1);
    expect((row!.expectedOutput as unknown[])[0]).toMatchObject({
      file: 'src/api/users.ts',
      start_line: 2,
      end_line: 4,
      severity: 'WARNING',
    });
    expect(row!.inputMeta).toMatchObject({
      source_finding: {
        finding_id: finding.id,
        file: 'src/api/users.ts',
        start_line: 2,
        end_line: 4,
        decision: 'accepted',
      },
      pr_id: pr.id,
      pr_number: pr.number,
      review_id: review.id,
    });
    expect(row!.inputDiff).toContain('@@');
    expect(await countCases()).toBe(before + 1);

    await app.close();
  });

  it('dismissed finding → 201 with expected_output = []', async () => {
    const app = await buildTestApp();
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const review = await insertReview(pg.handle.db, workspaceId, pr.id, agentId);
    const finding = await insertFinding(pg.handle.db, review.id, { dismissedAt: new Date() });

    const res = await app.inject({ method: 'POST', url: `/findings/${finding.id}/eval-case` });
    expect(res.statusCode).toBe(201);
    const [row] = await pg.handle.db
      .select()
      .from(t.evalCases)
      .where(eq(t.evalCases.id, res.json().case_id));
    expect(row!.expectedOutput).toEqual([]);

    await app.close();
  });

  it('unresolved finding → 422, 0 new rows', async () => {
    const app = await buildTestApp();
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const review = await insertReview(pg.handle.db, workspaceId, pr.id, agentId);
    const finding = await insertFinding(pg.handle.db, review.id);

    const before = await countCases();
    const res = await app.inject({ method: 'POST', url: `/findings/${finding.id}/eval-case` });
    expect(res.statusCode).toBe(422);
    expect(await countCases()).toBe(before);

    await app.close();
  });

  it("kind !== 'finding' → 422, 0 new rows", async () => {
    const app = await buildTestApp();
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const review = await insertReview(pg.handle.db, workspaceId, pr.id, agentId);
    const finding = await insertFinding(pg.handle.db, review.id, {
      acceptedAt: new Date(),
      kind: 'secret_leak',
    });

    const before = await countCases();
    const res = await app.inject({ method: 'POST', url: `/findings/${finding.id}/eval-case` });
    expect(res.statusCode).toBe(422);
    expect(await countCases()).toBe(before);

    await app.close();
  });

  it('PR with no patch for the finding\'s file → error, 0 new rows', async () => {
    const app = await buildTestApp();
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId, { withPatch: false });
    const review = await insertReview(pg.handle.db, workspaceId, pr.id, agentId);
    const finding = await insertFinding(pg.handle.db, review.id, { acceptedAt: new Date() });

    const before = await countCases();
    const res = await app.inject({ method: 'POST', url: `/findings/${finding.id}/eval-case` });
    expect(res.statusCode).toBe(422);
    expect(await countCases()).toBe(before);

    await app.close();
  });

  it('repeated call for the same finding returns the SAME case_id (no duplicate row)', async () => {
    const app = await buildTestApp();
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const review = await insertReview(pg.handle.db, workspaceId, pr.id, agentId);
    const finding = await insertFinding(pg.handle.db, review.id, { acceptedAt: new Date() });

    const first = await app.inject({ method: 'POST', url: `/findings/${finding.id}/eval-case` });
    expect(first.statusCode).toBe(201);
    const before = await countCases();

    const second = await app.inject({ method: 'POST', url: `/findings/${finding.id}/eval-case` });
    expect(second.statusCode).toBe(200);
    expect(second.json().case_id).toBe(first.json().case_id);
    expect(await countCases()).toBe(before);

    await app.close();
  });

  it('a finding belonging to another workspace → 404', async () => {
    const app = await buildTestApp();
    const [otherWs] = await pg.handle.db
      .insert(t.workspaces)
      .values({ name: `other-ws-${repoSeq++}` })
      .returning();
    const { pr } = await setupRepoAndPr(pg.handle.db, otherWs!.id);
    const review = await insertReview(pg.handle.db, otherWs!.id, pr.id, agentId);
    const finding = await insertFinding(pg.handle.db, review.id, { acceptedAt: new Date() });

    const res = await app.inject({ method: 'POST', url: `/findings/${finding.id}/eval-case` });
    expect(res.statusCode).toBe(404);

    await app.close();
  });
});
