import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient, MockLLMProvider } from '../src/adapters';
import type { RepoIntel } from '../src/modules/repo-intel';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[conventions-crud] Docker not available — skipping integration tests.');
}

/**
 * Conventions module — list/accept/reject/rescan-guard/create-skill round
 * trip against real Postgres. `repoIntel` and `llm` are the only mocked
 * pieces (both real external dependencies); everything else — routes,
 * JobRunner, and the DB writes — runs for real. Mirrors `skills-crud.it.test.ts`.
 */
d('conventions CRUD + rescan', () => {
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

  let repoSeq = 0;
  async function makeRepo() {
    const name = `conventions-${repoSeq++}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    return repo!;
  }

  async function makeConvention(repoId: string) {
    const [scan] = await pg.handle.db
      .insert(t.conventionScans)
      .values({ workspaceId, repoId, status: 'done' })
      .returning();
    const [conv] = await pg.handle.db
      .insert(t.conventions)
      .values({
        workspaceId,
        repoId,
        scanId: scan!.id,
        title: 'Some rule',
        rule: 'Do the thing.',
        evidencePath: 'src/x.ts',
        startLine: 1,
        endLine: 2,
        evidenceSnippet: 'x',
        confidence: 0.8,
      })
      .returning();
    return conv!;
  }

  function makeRepoIntelStub(
    paths: string[],
    files: { path: string; content: string }[],
  ): RepoIntel {
    return {
      getConventionSamples: async () => paths,
      getFileContents: async () => files,
    } as unknown as RepoIntel;
  }

  function makeApp(opts: { repoIntel?: RepoIntel; llmStructured?: unknown } = {}) {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient(),
        github: new MockGitHubClient(),
        ...(opts.repoIntel ? { repoIntel: opts.repoIntel } : {}),
        llm: {
          openrouter: new MockLLMProvider('openai', {
            structured: opts.llmStructured ?? { conventions: [] },
          }),
        },
      },
    });
  }

  it('GET /repos/:id/conventions → empty list + null latest_scan for a fresh repo', async () => {
    const app = await makeApp();
    const repo = await makeRepo();

    const res = await app.inject({ method: 'GET', url: `/repos/${repo.id}/conventions` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ conventions: [], latest_scan: null });
    await app.close();
  });

  it(
    'rescan → job runs → GET reflects the persisted candidate; accept + skill-draft + ' +
      'create-skill round trip',
    async () => {
      const repoIntelStub = makeRepoIntelStub(
        ['src/index.ts'],
        [{ path: 'src/index.ts', content: 'export const x = 1;' }],
      );
      const app = await makeApp({
        repoIntel: repoIntelStub,
        llmStructured: {
          conventions: [
            {
              title: 'Result type',
              rule: 'Handlers return Result<T>.',
              file: 'src/index.ts',
              start_line: 1,
              end_line: 1,
              snippet: 'export const x = 1;',
              confidence: 0.9,
            },
          ],
        },
      });
      const repo = await makeRepo();

      const rescan = await app.inject({
        method: 'POST',
        url: `/repos/${repo.id}/conventions/rescan`,
      });
      expect(rescan.statusCode).toBe(202);
      expect(rescan.json().status).toBe('accepted');

      // JobRunner processes on a queue — drain it before asserting on the result.
      await app.container.jobs.onIdle();

      const list = await app.inject({ method: 'GET', url: `/repos/${repo.id}/conventions` });
      const body = list.json();
      expect(body.latest_scan).toMatchObject({
        status: 'done',
        sample_file_count: 1,
        candidate_count: 1,
      });
      expect(body.conventions).toHaveLength(1);
      const candidate = body.conventions[0];
      expect(candidate).toMatchObject({ title: 'Result type', status: 'pending' });

      const accepted = await app.inject({
        method: 'POST',
        url: `/conventions/${candidate.id}/accept`,
      });
      expect(accepted.statusCode).toBe(200);
      expect(accepted.json().status).toBe('accepted');

      const draft = await app.inject({
        method: 'POST',
        url: '/conventions/skill-draft',
        payload: { convention_ids: [candidate.id] },
      });
      expect(draft.statusCode).toBe(200);
      expect(draft.json().body).toContain('Result type');

      const created = await app.inject({
        method: 'POST',
        url: '/conventions/create-skill',
        payload: {
          convention_ids: [candidate.id],
          name: draft.json().name,
          description: draft.json().description,
          type: 'convention',
          body: draft.json().body,
        },
      });
      expect(created.statusCode).toBe(201);
      expect(created.json()).toMatchObject({ source: 'extracted', type: 'convention' });

      // The merged convention's content now lives in the skill — it must not
      // linger in the review queue (it would otherwise be mergeable again).
      const afterCreate = await app.inject({ method: 'GET', url: `/repos/${repo.id}/conventions` });
      expect(afterCreate.json().conventions).toHaveLength(0);

      await app.close();
    },
  );

  it('POST /conventions/:id/reject → status rejected; unknown id → 404', async () => {
    const app = await makeApp();
    const repo = await makeRepo();
    const conv = await makeConvention(repo.id);

    const rejected = await app.inject({ method: 'POST', url: `/conventions/${conv.id}/reject` });
    expect(rejected.statusCode).toBe(200);
    expect(rejected.json().status).toBe('rejected');

    const ghost = '00000000-0000-0000-0000-000000000000';
    const missing = await app.inject({ method: 'POST', url: `/conventions/${ghost}/reject` });
    expect(missing.statusCode).toBe(404);
    await app.close();
  });

  it('rescan is idempotent while a scan is already running for the repo', async () => {
    const app = await makeApp();
    const repo = await makeRepo();
    await pg.handle.db
      .insert(t.conventionScans)
      .values({ workspaceId, repoId: repo.id, status: 'running' });

    const res = await app.inject({ method: 'POST', url: `/repos/${repo.id}/conventions/rescan` });
    expect(res.statusCode).toBe(202);
    expect(res.json().job_id).toBeNull();
    await app.close();
  });

  it(
    'POST /repos/:id/conventions/reset-accepted bulk-reverts every accepted convention to ' +
      'pending, leaving rejected ones untouched',
    async () => {
      const app = await makeApp();
      const repo = await makeRepo();
      const accepted1 = await makeConvention(repo.id);
      const accepted2 = await makeConvention(repo.id);
      const rejected = await makeConvention(repo.id);
      const pending = await makeConvention(repo.id);
      await app.inject({ method: 'POST', url: `/conventions/${accepted1.id}/accept` });
      await app.inject({ method: 'POST', url: `/conventions/${accepted2.id}/accept` });
      await app.inject({ method: 'POST', url: `/conventions/${rejected.id}/reject` });

      const res = await app.inject({
        method: 'POST',
        url: `/repos/${repo.id}/conventions/reset-accepted`,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ reset: 2 });

      const list = await app.inject({ method: 'GET', url: `/repos/${repo.id}/conventions` });
      const byId = new Map(
        (list.json().conventions as { id: string; status: string; decided_at: string | null }[]).map(
          (c) => [c.id, c],
        ),
      );
      expect(byId.get(accepted1.id)).toMatchObject({ status: 'pending', decided_at: null });
      expect(byId.get(accepted2.id)).toMatchObject({ status: 'pending', decided_at: null });
      expect(byId.get(rejected.id)).toMatchObject({ status: 'rejected' });
      expect(byId.get(pending.id)).toMatchObject({ status: 'pending' });

      await app.close();
    },
  );
});
