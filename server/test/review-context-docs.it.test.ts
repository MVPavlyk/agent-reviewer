import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockGitClient, MockGitHubClient } from '../src/adapters/index.js';
import * as t from '../src/db/schema.js';
import type { LLMProvider, Review } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[review-context-docs] Docker not available — skipping integration tests.');
}

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

const REVIEW_FIXTURE: Review = {
  verdict: 'approve',
  summary: 'Looks fine.',
  score: 100,
  findings: [],
};

/** Throws instead of returning — simulates a context-length overflow reported
 *  by the provider (AC-28, EC-18). No token-budget precheck exists in this
 *  codebase on purpose (AC-27) — this is what "overflow surfaces naturally"
 *  looks like in a test. */
class OverflowLLMProvider implements LLMProvider {
  readonly id: 'openai' = 'openai';
  async listModels() {
    return [{ id: 'gpt-4.1', provider: 'openai' as const }];
  }
  async complete(): Promise<never> {
    throw new Error('context_length_exceeded');
  }
  async completeStructured(): Promise<never> {
    throw new Error('context_length_exceeded');
  }
  async embed(texts: string[]) {
    return texts.map(() => new Array(1536).fill(0));
  }
}

/**
 * Крок 8 — project-context docs on the run's hot path. Covers SPEC-01
 * AC-23/AC-24/AC-25/AC-26/AC-28/AC-29/AC-31/AC-32/AC-33/AC-34, EC-4, EC-6,
 * EC-14, EC-17, EC-18.
 */
d('review-context-docs — prompt_assembly.specs + specs_read', () => {
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
    clonePath = await mkdtemp(join(tmpdir(), 'review-context-docs-it-'));
  });
  afterEach(async () => {
    await rm(clonePath, { recursive: true, force: true });
  });

  function makeApp(llmOverride?: LLMProvider) {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient({ diff: DIFF }),
        github: new MockGitHubClient(),
        llm: {
          openai: llmOverride ?? new MockLLMProvider('openai', { structured: REVIEW_FIXTURE }),
          // Intent Layer's lazy-auto classification defaults to 'openrouter'.
          openrouter: new MockLLMProvider('openai', {
            structuredBySchema: {
              Intent: { summary: 'test PR', in_scope: [], out_of_scope: [] },
            },
          }),
        },
      },
    });
  }

  async function writeDoc(dir: string, rel: string, contents: string) {
    const full = join(dir, rel);
    await mkdir(full.slice(0, full.lastIndexOf('/')), { recursive: true });
    await writeFile(full, contents);
  }

  async function insertRepo(withClonePath: string | null) {
    const uniq = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const [row] = await pg.handle.db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name: `ctx-repo-${uniq}`,
        fullName: `acme/ctx-repo-${uniq}`,
        clonePath: withClonePath,
      })
      .returning();
    return row!;
  }

  async function insertPr(repoId: string) {
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId,
        number: 1,
        title: 'Some change',
        author: 'dev',
        branch: 'feat/x',
        base: 'main',
        headSha: 'a1b2c3d4',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
        body: null,
      })
      .returning();
    await pg.handle.db.insert(t.prFiles).values({
      prId: pr!.id,
      path: 'src/config.ts',
      additions: 1,
      deletions: 0,
      patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
    });
    return pr!;
  }

  async function createAgent(app: Awaited<ReturnType<typeof makeApp>>) {
    const res = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: {
        name: `Ctx Agent ${Date.now()}-${Math.random()}`,
        provider: 'openai',
        model: 'gpt-4.1',
        system_prompt: 'Review.',
      },
    });
    return res.json().id as string;
  }

  async function attachAgentDocs(
    app: Awaited<ReturnType<typeof makeApp>>,
    agentId: string,
    paths: string[],
  ) {
    await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/context-docs`,
      payload: { paths },
    });
  }

  async function runReview(
    app: Awaited<ReturnType<typeof makeApp>>,
    prId: string,
    agentId: string,
  ) {
    const before = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.prId, prId));
    const res = await app.inject({
      method: 'POST',
      url: `/pulls/${prId}/review`,
      payload: { agentId },
    });
    const runId = res.json().runs[0].run_id as string;
    await waitForPrRuns(pg.handle.db, prId, { expected: before.length + 1, timeoutMs: 30_000 });
    // `completeAgentRun` (status → done/failed) and `saveRunTrace` are two
    // separate writes in run-executor.ts, in that order — `waitForPrRuns`
    // only observes the first. Under full-suite Testcontainers contention the
    // second can lag by a beat, so poll briefly instead of assuming it has
    // landed the instant the status flips.
    let trace: unknown;
    const traceDeadline = Date.now() + 5_000;
    for (;;) {
      const res = await app.inject({ method: 'GET', url: `/runs/${runId}/trace` });
      if (res.statusCode === 200) {
        trace = res.json();
        break;
      }
      if (Date.now() > traceDeadline) {
        trace = res.json();
        break;
      }
      await new Promise((r) => setTimeout(r, 25));
    }
    return { runId, trace: trace as Record<string, any> };
  }

  it('attached docs reach prompt_assembly.specs (wrapUntrusted + path) and specs_read (AC-23/24/25/29/31/32)', async () => {
    const app = await makeApp();
    const repo = await insertRepo(clonePath);
    const pr = await insertPr(repo.id);
    const agentId = await createAgent(app);
    await writeDoc(clonePath, 'specs/a.md', 'Do not hardcode secrets.');
    await attachAgentDocs(app, agentId, ['specs/a.md']);

    const { trace } = await runReview(app, pr.id, agentId);

    expect(trace.prompt_assembly.specs).not.toBeNull();
    expect(trace.prompt_assembly.specs).toContain('<untrusted source="spec-0">');
    expect(trace.prompt_assembly.specs).toContain('specs/a.md');
    expect(trace.prompt_assembly.specs).toContain('Do not hardcode secrets.');
    expect(trace.specs_read).toEqual(['specs/a.md']);
    await app.close();
  });

  it('agent with no attached docs: specs is null, specs_read is empty (AC-29)', async () => {
    const app = await makeApp();
    const repo = await insertRepo(clonePath);
    const pr = await insertPr(repo.id);
    const agentId = await createAgent(app);

    const { trace } = await runReview(app, pr.id, agentId);

    expect(trace.prompt_assembly.specs).toBeNull();
    expect(trace.specs_read).toEqual([]);
    await app.close();
  });

  it('a deleted-since-attach file is skipped, not fatal — run still completes (AC-26, EC-6, EC-7, EC-17)', async () => {
    const app = await makeApp();
    const repo = await insertRepo(clonePath);
    const pr = await insertPr(repo.id);
    const agentId = await createAgent(app);
    // Attach a path that was never written to the clone (equivalent to
    // "deleted since attach" — the reader can't tell the difference).
    await attachAgentDocs(app, agentId, ['specs/missing.md']);

    const { trace } = await runReview(app, pr.id, agentId);

    const runs = await pg.handle.db
      .select()
      .from(t.agentRuns)
      .where(eq(t.agentRuns.prId, pr.id));
    expect(runs[0]!.status).toBe('done');
    expect(trace.specs_read).toEqual([]);
    expect(trace.prompt_assembly.specs).toBeNull();
    await app.close();
  });

  it('persists a run_context_docs row per doc actually read (AC-34)', async () => {
    const app = await makeApp();
    const repo = await insertRepo(clonePath);
    const pr = await insertPr(repo.id);
    const agentId = await createAgent(app);
    await writeDoc(clonePath, 'specs/a.md', 'Attributed doc.');
    await attachAgentDocs(app, agentId, ['specs/a.md', 'specs/missing.md']);

    const { runId } = await runReview(app, pr.id, agentId);

    const rows = await pg.handle.db
      .select()
      .from(t.runContextDocs)
      .where(eq(t.runContextDocs.runId, runId));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.path).toBe('specs/a.md');
    expect(rows[0]!.source).toBe('agent');
    expect(rows[0]!.contentHash).toEqual(expect.any(String));
    await app.close();
  });

  it('two repos in one workspace: the run reads from THIS PR repo clone, not the other one (EC-14, A-1)', async () => {
    const app = await makeApp();
    const otherClone = await mkdtemp(join(tmpdir(), 'review-context-docs-it-other-'));
    try {
      const repoA = await insertRepo(clonePath);
      const repoB = await insertRepo(otherClone);
      // Same relative path exists in BOTH clones, with different content —
      // proves the read comes from repoB's clone (the PR's own repo), not A.
      await writeDoc(clonePath, 'specs/shared.md', 'Content from repo A — should NOT be read.');
      await writeDoc(otherClone, 'specs/shared.md', 'Content from repo B — the PR repo.');

      const prOnB = await insertPr(repoB.id);
      const agentId = await createAgent(app);
      await attachAgentDocs(app, agentId, ['specs/shared.md']);

      const { trace } = await runReview(app, prOnB.id, agentId);

      expect(trace.prompt_assembly.specs).toContain('Content from repo B — the PR repo.');
      expect(trace.prompt_assembly.specs).not.toContain('Content from repo A — should NOT be read.');
      void repoA;
      await app.close();
    } finally {
      await rm(otherClone, { recursive: true, force: true });
    }
  });

  it('provider overflow: status=failed, cost_usd=null (AC-28, EC-18) — no token-budget precheck', async () => {
    const app = await makeApp(new OverflowLLMProvider());
    const repo = await insertRepo(clonePath);
    const pr = await insertPr(repo.id);
    const agentId = await createAgent(app);
    await writeDoc(clonePath, 'specs/a.md', 'Some project context.');
    await attachAgentDocs(app, agentId, ['specs/a.md']);

    await runReview(app, pr.id, agentId);

    const runs = await pg.handle.db
      .select()
      .from(t.agentRuns)
      .where(eq(t.agentRuns.prId, pr.id));
    expect(runs[0]!.status).toBe('failed');
    expect(runs[0]!.costUsd).toBeNull();
    await app.close();
  });
});
