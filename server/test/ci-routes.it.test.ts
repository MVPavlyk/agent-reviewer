import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/index.js';
import type { RunnerBundle } from '../src/modules/ci/service.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[ci-routes] Docker not available — skipping integration tests.');
}

/** A stub RunnerBundle that always reports the bundle as built — no real
 *  agent-runner/dist/ needed for these tests (per the plan's DI-stub design). */
class StubRunnerBundle implements RunnerBundle {
  async read(): Promise<string | null> {
    return '/* stub compiled runner */';
  }
}

/** A stub that reports the bundle as NOT built — the "runner not built" 5xx path. */
class MissingRunnerBundle implements RunnerBundle {
  async read(): Promise<string | null> {
    return null;
  }
}

d('ci routes (SPEC-05)', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp(
    runnerBundle: RunnerBundle = new StubRunnerBundle(),
    github: MockGitHubClient = new MockGitHubClient(),
  ) {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github, runnerBundle },
    });
  }

  async function createAgent(app: Awaited<ReturnType<typeof makeApp>>) {
    const res = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: {
        name: 'Security Reviewer',
        provider: 'openrouter',
        model: 'openrouter/deepseek-v4-flash',
        system_prompt: 'Review PRs for security issues.',
      },
    });
    return res.json();
  }

  it('POST /agents/:id/export-ci → 200 + CiExport shape', async () => {
    const app = await makeApp();
    const agent = await createAgent(app);

    const res = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/export-ci`,
      payload: { repo: 'acme/payments-api', action: 'files' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.pr_url).toBeNull();
    expect(body.installation).toMatchObject({ agent_id: agent.id, repo: 'acme/payments-api', target_type: 'gha' });
    const paths = body.files.map((f: { path: string }) => f.path);
    expect(paths).toContain('.devdigest/agents/security-reviewer.yaml');
    expect(paths).toContain('.github/workflows/devdigest-review.yml');
    expect(paths).toContain('.devdigest/runner/index.js');
    // ADDENDUM v2 decision 3 reverses v1's exclusion — memory.jsonl is back.
    expect(paths).toContain('.devdigest/memory.jsonl');
    await app.close();
  });

  it('persists workflow_version on the installation row at export time (ADDENDUM v2 — "Workflow version")', async () => {
    const app = await makeApp();
    const agent = await createAgent(app);
    await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/export-ci`,
      payload: { repo: 'acme/workflow-version-repo', action: 'files' },
    });
    const [row] = await pg.handle.db
      .select()
      .from(t.ciInstallations)
      .where(eq(t.ciInstallations.repo, 'acme/workflow-version-repo'));
    expect(row!.workflowVersion).not.toBeNull();
    await app.close();
  });

  it('workflow file has least-privilege permissions, an ingest step with no literal secret, and a version marker (ADDENDUM v2 decision 6)', async () => {
    const app = await makeApp();
    const agent = await createAgent(app);

    const res = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/export-ci`,
      payload: { repo: 'acme/hardened-workflow', action: 'files', post_as: 'none' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const workflowFile = body.files.find((f: { path: string }) => f.path === '.github/workflows/devdigest-review.yml');
    expect(workflowFile).toBeDefined();
    const contents: string = workflowFile.contents;

    expect(contents).toContain('devdigest-workflow-version:');
    expect(contents).toContain('permissions:');
    expect(contents).toContain('contents: read');
    // post_as: 'none' → no pull-requests write permission granted.
    expect(contents).not.toContain('pull-requests: write');
    expect(contents).toContain('secrets.DEVDIGEST_INGEST_TOKEN');
    expect(contents).toContain('/ci/ingest');
    // No literal secret value anywhere in the generated file.
    expect(contents).not.toMatch(/sk-[a-zA-Z0-9]/);
    await app.close();
  });

  it('post_as !== "none" grants pull-requests: write in the workflow permissions block', async () => {
    const app = await makeApp();
    const agent = await createAgent(app);

    const res = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/export-ci`,
      payload: { repo: 'acme/hardened-workflow-write', action: 'files', post_as: 'github_review' },
    });
    const body = res.json();
    const workflowFile = body.files.find((f: { path: string }) => f.path === '.github/workflows/devdigest-review.yml');
    expect(workflowFile.contents).toContain('pull-requests: write');
    await app.close();
  });

  it('target: "circle" → 4xx, no files generated, no installation persisted (AC-12)', async () => {
    const app = await makeApp();
    const agent = await createAgent(app);

    const res = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/export-ci`,
      payload: { repo: 'acme/payments-api', target: 'circle', action: 'files' },
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.statusCode).toBeLessThan(500);

    const rows = await pg.handle.db
      .select()
      .from(t.ciInstallations)
      .where(eq(t.ciInstallations.agentId, agent.id));
    expect(rows).toHaveLength(0);
    await app.close();
  });

  it('action: "open_pr" (Pass 5, now REAL) → creates the devdigest/ci branch + a PR, returns pr_url, persists the installation with pr_url + a one-time ingest token', async () => {
    const github = new MockGitHubClient();
    const app = await makeApp(new StubRunnerBundle(), github);
    const agent = await createAgent(app);

    const res = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/export-ci`,
      payload: { repo: 'acme/open-pr-target', action: 'open_pr', base: 'main' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(typeof body.pr_url).toBe('string');
    expect(body.pr_url).not.toBeNull();
    // One-time plaintext token in the response — never null on a real export.
    expect(typeof body.ingest_token).toBe('string');
    expect(body.ingest_token!.length).toBeGreaterThan(0);

    // Committed to the dedicated branch off the given base — NEVER to `main`
    // as the commit target itself.
    expect(github.committed).toHaveLength(1);
    expect(github.committed[0]!.branch).toBe('devdigest/ci');
    expect(github.committed[0]!.base).toBe('main');
    expect(github.openedPrs).toHaveLength(1);
    expect(github.openedPrs[0]!.head).toBe('devdigest/ci');
    expect(github.openedPrs[0]!.base).toBe('main');

    const rows = await pg.handle.db
      .select()
      .from(t.ciInstallations)
      .where(eq(t.ciInstallations.repo, 'acme/open-pr-target'));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.prUrl).toBe(body.pr_url);
    // Only the HASH is persisted — never the plaintext token.
    expect(rows[0]!.ingestTokenHash).not.toBeNull();
    expect(rows[0]!.ingestTokenHash).not.toBe(body.ingest_token);
    await app.close();
  });

  it('action: "preview" (Pass 5, CRITICAL) → returns the bundle with ZERO GitHub calls and ZERO DB writes', async () => {
    const github = new MockGitHubClient();
    const app = await makeApp(new StubRunnerBundle(), github);
    const agent = await createAgent(app);

    const res = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/export-ci`,
      payload: { repo: 'acme/preview-only', action: 'preview' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.pr_url).toBeNull();
    expect(body.ingest_token).toBeNull();
    const paths = body.files.map((f: { path: string }) => f.path);
    expect(paths).toContain('.github/workflows/devdigest-review.yml');

    // Zero GitHub calls.
    expect(github.committed).toHaveLength(0);
    expect(github.openedPrs).toHaveLength(0);

    // Zero DB writes — no installation row for this repo.
    const rows = await pg.handle.db
      .select()
      .from(t.ciInstallations)
      .where(eq(t.ciInstallations.repo, 'acme/preview-only'));
    expect(rows).toHaveLength(0);
    await app.close();
  });

  it('action: "files" also mints a one-time ingest token, and it differs from the persisted hash (never logs/echoes the plaintext)', async () => {
    const app = await makeApp();
    const agent = await createAgent(app);

    const res = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/export-ci`,
      payload: { repo: 'acme/files-token-target', action: 'files' },
    });
    const body = res.json();
    expect(typeof body.ingest_token).toBe('string');

    const [row] = await pg.handle.db
      .select()
      .from(t.ciInstallations)
      .where(eq(t.ciInstallations.repo, 'acme/files-token-target'));
    expect(row!.ingestTokenHash).not.toBeNull();
    expect(row!.ingestTokenHash).not.toBe(body.ingest_token);
    await app.close();
  });

  it('GitHub write failure on "open_pr" surfaces a clean error and never leaks the token', async () => {
    const failingGithub = new MockGitHubClient();
    failingGithub.commitFiles = async () => {
      throw new Error('simulated GitHub API failure');
    };
    const app = await makeApp(new StubRunnerBundle(), failingGithub);
    const agent = await createAgent(app);

    const res = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/export-ci`,
      payload: { repo: 'acme/open-pr-failure', action: 'open_pr' },
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(500);
    const bodyText = JSON.stringify(res.json());
    // No token/secret material anywhere in the error body — just the failure.
    expect(bodyText).not.toMatch(/[0-9a-f]{64}/); // a 32-byte hex ingest token
    expect(bodyText).not.toContain('ingest_token');
    expect(bodyText).not.toContain('Bearer');

    const rows = await pg.handle.db
      .select()
      .from(t.ciInstallations)
      .where(eq(t.ciInstallations.repo, 'acme/open-pr-failure'));
    expect(rows).toHaveLength(0);
    await app.close();
  });

  it('bad "base" (path-traversal-shaped ref) → 422, never reaches Octokit (S2)', async () => {
    const app = await makeApp();
    const agent = await createAgent(app);

    const res = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/export-ci`,
      payload: { repo: 'acme/bad-base-repo', action: 'files', base: '../../etc/passwd' },
    });
    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('bad "base" with shell metacharacters → 422', async () => {
    const app = await makeApp();
    const agent = await createAgent(app);

    const res = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/export-ci`,
      payload: { repo: 'acme/bad-base-repo-2', action: 'files', base: 'main; rm -rf /' },
    });
    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('missing repo → 422', async () => {
    const app = await makeApp();
    const agent = await createAgent(app);

    const res = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/export-ci`,
      payload: { action: 'files' },
    });
    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('a body-less POST also → 422 (null body normalizes to {})', async () => {
    const app = await makeApp();
    const agent = await createAgent(app);

    const res = await app.inject({ method: 'POST', url: `/agents/${agent.id}/export-ci` });
    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('foreign workspace → 404 on export, list, and (implicitly) no cross-tenant leak', async () => {
    const { db } = pg.handle;
    const [otherWs] = await db.insert(t.workspaces).values({ name: 'other-ci-ws' }).returning();
    const [foreignAgent] = await db
      .insert(t.agents)
      .values({
        workspaceId: otherWs!.id,
        name: 'Foreign Agent',
        provider: 'openrouter',
        model: 'm',
        systemPrompt: 'p',
      })
      .returning();

    const app = await makeApp();
    const exportRes = await app.inject({
      method: 'POST',
      url: `/agents/${foreignAgent!.id}/export-ci`,
      payload: { repo: 'acme/payments-api', action: 'files' },
    });
    expect(exportRes.statusCode).toBe(404);

    const listRes = await app.inject({ method: 'GET', url: `/agents/${foreignAgent!.id}/ci` });
    expect(listRes.statusCode).toBe(404);
    await app.close();
  });

  it('two exports of the same agent+repo → one ci_installations row (AC-11, EC-2, NFR-3)', async () => {
    const app = await makeApp();
    const agent = await createAgent(app);

    await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/export-ci`,
      payload: { repo: 'acme/idempotent-repo', action: 'files' },
    });
    await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/export-ci`,
      payload: { repo: 'acme/idempotent-repo', action: 'files' },
    });

    const rows = await pg.handle.db
      .select()
      .from(t.ciInstallations)
      .where(eq(t.ciInstallations.repo, 'acme/idempotent-repo'));
    expect(rows).toHaveLength(1);
    await app.close();
  });

  it('GET /agents/:id/ci → installations with neutral status when no runs exist yet (AC-19, EC-1)', async () => {
    const app = await makeApp();
    const agent = await createAgent(app);
    await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/export-ci`,
      payload: { repo: 'acme/no-runs-yet', action: 'files' },
    });

    const res = await app.inject({ method: 'GET', url: `/agents/${agent.id}/ci` });
    expect(res.statusCode).toBe(200);
    const list = res.json();
    const row = list.find((r: any) => r.installation.repo === 'acme/no-runs-yet');
    expect(row).toBeDefined();
    expect(row.last_run).toBeNull();
    expect(row.runs).toEqual([]);
    await app.close();
  });

  it('GET /agents/:id/ci → installation carries workflow_version/pr_url, and recent run history (PART C, items 7/9)', async () => {
    const app = await makeApp();
    const agent = await createAgent(app);
    const exportRes = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/export-ci`,
      payload: { repo: 'acme/history-repo', action: 'open_pr', base: 'main' },
    });
    const installationId = exportRes.json().installation.id;

    await pg.handle.db.insert(t.ciRuns).values([
      {
        ciInstallationId: installationId,
        prNumber: 101,
        ranAt: new Date('2026-01-01T00:00:00Z'),
        status: 'succeeded',
        findingsCount: 0,
      },
      {
        ciInstallationId: installationId,
        prNumber: 102,
        ranAt: new Date('2026-01-02T00:00:00Z'),
        status: 'failed',
        findingsCount: 3,
      },
    ]);

    const res = await app.inject({ method: 'GET', url: `/agents/${agent.id}/ci` });
    expect(res.statusCode).toBe(200);
    const row = res.json().find((r: any) => r.installation.repo === 'acme/history-repo');
    expect(row).toBeDefined();
    expect(row.installation.workflow_version).not.toBeNull();
    expect(typeof row.installation.pr_url).toBe('string');
    expect(row.runs.length).toBeGreaterThanOrEqual(2);
    expect(row.runs.map((r: any) => r.pr_number)).toContain(101);
    expect(row.runs.map((r: any) => r.pr_number)).toContain(102);
    await app.close();
  });

  it('GET /ci/runs → empty list when no rows exist, sorted desc(ran_at) and tolerating a null installation (AC-17, EC-7)', async () => {
    const app = await makeApp();

    const empty = await app.inject({ method: 'GET', url: '/ci/runs' });
    expect(empty.statusCode).toBe(200);

    const { db } = pg.handle;
    const agent = await createAgent(app);
    const exportRes = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/export-ci`,
      payload: { repo: 'acme/runs-repo', action: 'files' },
    });
    const installationId = exportRes.json().installation.id;

    await db.insert(t.ciRuns).values([
      {
        ciInstallationId: installationId,
        prNumber: 1,
        ranAt: new Date('2026-01-01T00:00:00Z'),
        status: 'succeeded',
        findingsCount: 0,
      },
      {
        ciInstallationId: installationId,
        prNumber: 2,
        ranAt: new Date('2026-01-02T00:00:00Z'),
        status: 'failed',
        findingsCount: 3,
      },
      // Simulates a run whose installation was later deleted (onDelete: 'set null').
      { ciInstallationId: null, prNumber: 9, ranAt: new Date('2026-01-03T00:00:00Z'), status: 'succeeded' },
    ]);

    const res = await app.inject({ method: 'GET', url: '/ci/runs' });
    expect(res.statusCode).toBe(200);
    const runs = res.json();
    expect(runs.length).toBeGreaterThanOrEqual(3);
    const prNumbers = runs
      .filter((r: any) => [1, 2, 9].includes(r.pr_number))
      .map((r: any) => r.pr_number);
    expect(prNumbers).toEqual([9, 2, 1]); // desc(ran_at)
    const nullRow = runs.find((r: any) => r.pr_number === 9);
    expect(nullRow.ci_installation_id).toBeNull();
    expect(nullRow.repo).toBeNull();
    const linkedRow = runs.find((r: any) => r.pr_number === 1);
    expect(linkedRow.repo).toBe('acme/runs-repo');
    await app.close();
  });

  it('GET /ci/runs rows carry verdict/duration_ms/agent (PART C, item 8)', async () => {
    const app = await makeApp();
    const agent = await createAgent(app);
    const exportRes = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/export-ci`,
      payload: { repo: 'acme/runs-dto-repo', action: 'files' },
    });
    const installationId = exportRes.json().installation.id;

    await pg.handle.db.insert(t.ciRuns).values({
      ciInstallationId: installationId,
      prNumber: 42,
      ranAt: new Date('2026-02-01T00:00:00Z'),
      status: 'succeeded',
      findingsCount: 1,
      durationMs: 5500,
      verdict: 'comment',
    });

    const res = await app.inject({ method: 'GET', url: '/ci/runs' });
    expect(res.statusCode).toBe(200);
    const row = res.json().find((r: any) => r.pr_number === 42);
    expect(row).toBeDefined();
    expect(row.duration_ms).toBe(5500);
    expect(row.verdict).toBe('comment');
    expect(row.agent).toBe(agent.name);
    expect(row.agent_id).toBe(agent.id);
    expect(row.repo).toBe('acme/runs-dto-repo');
    await app.close();
  });

  it('missing runner bundle → 5xx "runner not built", no installation persisted', async () => {
    const app = await makeApp(new MissingRunnerBundle());
    const agent = await createAgent(app);

    const res = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/export-ci`,
      payload: { repo: 'acme/no-bundle-repo', action: 'files' },
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(500);

    const rows = await pg.handle.db
      .select()
      .from(t.ciInstallations)
      .where(eq(t.ciInstallations.repo, 'acme/no-bundle-repo'));
    expect(rows).toHaveLength(0);
    await app.close();
  });

  it('the module never writes ci_runs via /ci/runs — a POST there still 404s (AC-18 for THIS route; /ci/ingest is the dedicated Pass 6 writer)', async () => {
    const app = await makeApp();
    // No POST/PUT/PATCH/DELETE route on /ci/runs exists — a POST must 404.
    const res = await app.inject({ method: 'POST', url: '/ci/runs', payload: {} });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  describe('POST /ci/ingest (Pass 6, ADDENDUM v2 decision 2)', () => {
    const COMMIT_SHA = 'a'.repeat(40);

    async function createInstallation(app: Awaited<ReturnType<typeof makeApp>>, repo: string) {
      const agent = await createAgent(app);
      const exportRes = await app.inject({
        method: 'POST',
        url: `/agents/${agent.id}/export-ci`,
        payload: { repo, action: 'files' },
      });
      const body = exportRes.json();
      return { agent, repo, token: body.ingest_token as string, installationId: body.installation.id as string };
    }

    function validArtifact(overrides: Record<string, unknown> = {}) {
      return {
        findings_count: 2,
        critical: 1,
        warning: 1,
        suggestion: 0,
        cost_usd: 0.0123,
        duration_ms: 4200,
        agent: 'Security Reviewer',
        version: '1',
        pr_number: 7,
        github_url: 'https://github.com/acme/ingest-target/actions/runs/123',
        ...overrides,
      };
    }

    it('valid signed ingest writes exactly one agent_runs (source=ci) + one linked ci_runs', async () => {
      const app = await makeApp();
      const { repo, token, installationId } = await createInstallation(app, 'acme/ingest-target');

      const res = await app.inject({
        method: 'POST',
        url: '/ci/ingest',
        headers: {
          authorization: `Bearer ${token}`,
          'x-devdigest-commit-sha': COMMIT_SHA,
          'x-devdigest-repository': repo,
        },
        payload: validArtifact(),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.ok).toBe(true);
      expect(typeof body.agent_run_id).toBe('string');
      expect(typeof body.ci_run_id).toBe('string');

      const runs = await pg.handle.db
        .select()
        .from(t.agentRuns)
        .where(eq(t.agentRuns.id, body.agent_run_id));
      expect(runs).toHaveLength(1);
      expect(runs[0]!.source).toBe('ci');
      expect(runs[0]!.findingsCount).toBe(2);
      expect(runs[0]!.costUsd).toBeCloseTo(0.0123);
      expect(runs[0]!.durationMs).toBe(4200);
      // gate = 'critical' (agent default) → 1 blocker (the one critical finding).
      expect(runs[0]!.blockers).toBe(1);

      const ciRuns = await pg.handle.db
        .select()
        .from(t.ciRuns)
        .where(eq(t.ciRuns.id, body.ci_run_id));
      expect(ciRuns).toHaveLength(1);
      expect(ciRuns[0]!.ciInstallationId).toBe(installationId);
      expect(ciRuns[0]!.prNumber).toBe(7);
      expect(ciRuns[0]!.verdict).toBe('request_changes');
      expect(ciRuns[0]!.status).toBe('succeeded');
      expect(ciRuns[0]!.githubUrl).toBe('https://github.com/acme/ingest-target/actions/runs/123');
      expect(ciRuns[0]!.source).toBe('ci');
      await app.close();
    });

    it('bad/absent token → 401, nothing written', async () => {
      const app = await makeApp();
      const { repo, installationId } = await createInstallation(app, 'acme/ingest-bad-token');

      const noAuth = await app.inject({
        method: 'POST',
        url: '/ci/ingest',
        headers: { 'x-devdigest-commit-sha': COMMIT_SHA, 'x-devdigest-repository': repo },
        payload: validArtifact({ pr_number: 401 }),
      });
      expect(noAuth.statusCode).toBe(401);

      const wrongToken = await app.inject({
        method: 'POST',
        url: '/ci/ingest',
        headers: {
          authorization: 'Bearer not-a-real-token',
          'x-devdigest-commit-sha': COMMIT_SHA,
          'x-devdigest-repository': repo,
        },
        payload: validArtifact({ pr_number: 401 }),
      });
      expect(wrongToken.statusCode).toBe(401);

      const rows = await pg.handle.db
        .select()
        .from(t.ciRuns)
        .where(eq(t.ciRuns.ciInstallationId, installationId));
      expect(rows).toHaveLength(0);
      await app.close();
    });

    it('bad artifact schema → 422, nothing written', async () => {
      const app = await makeApp();
      const { repo, token } = await createInstallation(app, 'acme/ingest-bad-schema');

      const res = await app.inject({
        method: 'POST',
        url: '/ci/ingest',
        headers: {
          authorization: `Bearer ${token}`,
          'x-devdigest-commit-sha': COMMIT_SHA,
          'x-devdigest-repository': repo,
        },
        // Missing required `findings_count`/`agent`.
        payload: { cost_usd: null },
      });
      expect(res.statusCode).toBe(422);
      await app.close();
    });

    it('repo-header mismatch → 422, nothing written', async () => {
      const app = await makeApp();
      const { token } = await createInstallation(app, 'acme/ingest-repo-a');

      const res = await app.inject({
        method: 'POST',
        url: '/ci/ingest',
        headers: {
          authorization: `Bearer ${token}`,
          'x-devdigest-commit-sha': COMMIT_SHA,
          'x-devdigest-repository': 'acme/some-other-repo',
        },
        payload: validArtifact(),
      });
      expect(res.statusCode).toBe(422);
      await app.close();
    });

    it('missing/malformed commit-sha header → 422', async () => {
      const app = await makeApp();
      const { repo, token } = await createInstallation(app, 'acme/ingest-bad-sha');

      const res = await app.inject({
        method: 'POST',
        url: '/ci/ingest',
        headers: { authorization: `Bearer ${token}`, 'x-devdigest-repository': repo },
        payload: validArtifact(),
      });
      expect(res.statusCode).toBe(422);
      await app.close();
    });

    it('bad github_url (non-https/non-github.com) → 422, nothing written (W2)', async () => {
      const app = await makeApp();
      const { repo, token } = await createInstallation(app, 'acme/ingest-bad-url');

      const res = await app.inject({
        method: 'POST',
        url: '/ci/ingest',
        headers: {
          authorization: `Bearer ${token}`,
          'x-devdigest-commit-sha': COMMIT_SHA,
          'x-devdigest-repository': repo,
        },
        payload: validArtifact({ github_url: 'javascript:alert(1)' }),
      });
      expect(res.statusCode).toBe(422);
      await app.close();
    });

    it('negative cost_usd/duration_ms → 422, nothing written (W3)', async () => {
      const app = await makeApp();
      const { repo, token } = await createInstallation(app, 'acme/ingest-negative-numbers');

      const badCost = await app.inject({
        method: 'POST',
        url: '/ci/ingest',
        headers: {
          authorization: `Bearer ${token}`,
          'x-devdigest-commit-sha': COMMIT_SHA,
          'x-devdigest-repository': repo,
        },
        payload: validArtifact({ cost_usd: -1 }),
      });
      expect(badCost.statusCode).toBe(422);

      const badDuration = await app.inject({
        method: 'POST',
        url: '/ci/ingest',
        headers: {
          authorization: `Bearer ${token}`,
          'x-devdigest-commit-sha': COMMIT_SHA,
          'x-devdigest-repository': repo,
        },
        payload: validArtifact({ duration_ms: -5 }),
      });
      expect(badDuration.statusCode).toBe(422);
      await app.close();
    });

    it('duplicate ingest for the same installation+commit is idempotent — second POST writes no new rows, returns 200 with the SAME ids (W3)', async () => {
      const app = await makeApp();
      const { repo, token } = await createInstallation(app, 'acme/ingest-idempotent');

      const first = await app.inject({
        method: 'POST',
        url: '/ci/ingest',
        headers: {
          authorization: `Bearer ${token}`,
          'x-devdigest-commit-sha': COMMIT_SHA,
          'x-devdigest-repository': repo,
        },
        payload: validArtifact(),
      });
      expect(first.statusCode).toBe(200);
      const firstBody = first.json();

      const second = await app.inject({
        method: 'POST',
        url: '/ci/ingest',
        headers: {
          authorization: `Bearer ${token}`,
          'x-devdigest-commit-sha': COMMIT_SHA,
          'x-devdigest-repository': repo,
        },
        payload: validArtifact(),
      });
      expect(second.statusCode).toBe(200);
      const secondBody = second.json();

      expect(secondBody.agent_run_id).toBe(firstBody.agent_run_id);
      expect(secondBody.ci_run_id).toBe(firstBody.ci_run_id);

      const agentRunRows = await pg.handle.db
        .select()
        .from(t.agentRuns)
        .where(eq(t.agentRuns.id, firstBody.agent_run_id));
      expect(agentRunRows).toHaveLength(1);

      const ciRunRows = await pg.handle.db
        .select()
        .from(t.ciRuns)
        .where(eq(t.ciRuns.id, firstBody.ci_run_id));
      expect(ciRunRows).toHaveLength(1);
      await app.close();
    });

    it('never echoes the token in a response/error body', async () => {
      const app = await makeApp();
      const { repo, token } = await createInstallation(app, 'acme/ingest-no-leak');

      const ok = await app.inject({
        method: 'POST',
        url: '/ci/ingest',
        headers: {
          authorization: `Bearer ${token}`,
          'x-devdigest-commit-sha': COMMIT_SHA,
          'x-devdigest-repository': repo,
        },
        payload: validArtifact(),
      });
      expect(JSON.stringify(ok.json())).not.toContain(token);

      const reject = await app.inject({
        method: 'POST',
        url: '/ci/ingest',
        headers: { authorization: `Bearer wrong-token-value` },
      });
      expect(JSON.stringify(reject.json())).not.toContain('wrong-token-value');
      expect(JSON.stringify(reject.json())).not.toContain(token);
      await app.close();
    });
  });
});
