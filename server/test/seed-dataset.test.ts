import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import { ReviewRepository } from '../src/modules/reviews/repository.js';
import { diffFromPrFiles } from '../src/modules/reviews/diff-loader.js';
import * as t from '../src/db/schema.js';
import { eq, and } from 'drizzle-orm';

/**
 * L-06 (eval pipeline): proves the demo seed gives the eval pipeline a real
 * dataset to convert from day one (AC-68…AC-72) — `pr_files.patch` bodies,
 * a fully-resolved finding set, `reviews.agent_id` set, and idempotency
 * that does NOT rely on the outer `if (!pr)` gate (see server/INSIGHTS.md
 * "R-5" risk this test guards against: a naive re-run on an already-seeded
 * DB silently skipping the new columns).
 */

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[seed-dataset] Docker not available — skipping integration tests.');
}

d('seed() dataset for the eval pipeline', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
  }, 60_000);

  afterAll(async () => {
    await pg.stop();
  });

  it('gives every pr_files row a non-empty patch reconstructible via diffFromPrFiles', async () => {
    const { workspaceId } = await seed(pg.handle.db);

    const [repo] = await pg.handle.db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.fullName, 'acme/payments-api')));
    expect(repo).toBeDefined();

    const [pr] = await pg.handle.db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.repoId, repo!.id), eq(t.pullRequests.number, 482)));
    expect(pr).toBeDefined();

    const files = await pg.handle.db.select().from(t.prFiles).where(eq(t.prFiles.prId, pr!.id));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      expect(f.patch, `pr_files.${f.path}.patch must not be empty`).toBeTruthy();
      expect(f.patch!.trim().length).toBeGreaterThan(0);
    }

    // (b) diffFromPrFiles reconstructs a real UnifiedDiff from those patches.
    const repository = new ReviewRepository(pg.handle.db);
    const diff = await diffFromPrFiles(repository, pr!.id);
    expect(diff.files.length).toBeGreaterThan(0);
    for (const file of diff.files) {
      expect(file.hunks.length).toBeGreaterThan(0);
    }
  });

  it('seeds 10-12 findings, every one resolved with exactly one of accepted_at/dismissed_at', async () => {
    const { workspaceId } = await seed(pg.handle.db);

    const [repo] = await pg.handle.db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.fullName, 'acme/payments-api')));
    const [pr] = await pg.handle.db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.repoId, repo!.id), eq(t.pullRequests.number, 482)));
    const [review] = await pg.handle.db
      .select()
      .from(t.reviews)
      .where(and(eq(t.reviews.prId, pr!.id), eq(t.reviews.kind, 'review')));
    expect(review).toBeDefined();

    // (d) reviews.agent_id is not null.
    expect(review!.agentId).not.toBeNull();

    const findings = await pg.handle.db
      .select()
      .from(t.findings)
      .where(eq(t.findings.reviewId, review!.id));

    // (c) 10-12 findings, all resolved with exactly one of accepted_at/dismissed_at.
    expect(findings.length).toBeGreaterThanOrEqual(10);
    expect(findings.length).toBeLessThanOrEqual(12);
    for (const f of findings) {
      const hasAccepted = f.acceptedAt !== null;
      const hasDismissed = f.dismissedAt !== null;
      expect(hasAccepted !== hasDismissed, `finding "${f.title}" must have exactly one of accepted_at/dismissed_at`).toBe(true);
    }

    // >=8 convertible findings (kind='finding' + resolved).
    const convertible = findings.filter((f) => f.kind === 'finding');
    expect(convertible.length).toBeGreaterThanOrEqual(8);

    // (e) >=3 dismissed findings share a file with an accepted finding.
    const acceptedFiles = new Set(findings.filter((f) => f.acceptedAt !== null).map((f) => f.file));
    const dismissedInAcceptedFiles = findings.filter(
      (f) => f.dismissedAt !== null && acceptedFiles.has(f.file),
    );
    expect(dismissedInAcceptedFiles.length).toBeGreaterThanOrEqual(3);
  });

  it('replaces unmarked findings on an already-seeded (pre-L-06) DB', async () => {
    const { workspaceId } = await seed(pg.handle.db);

    const [repo] = await pg.handle.db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.fullName, 'acme/payments-api')));
    const [pr] = await pg.handle.db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.repoId, repo!.id), eq(t.pullRequests.number, 482)));
    const [review] = await pg.handle.db
      .select()
      .from(t.reviews)
      .where(and(eq(t.reviews.prId, pr!.id), eq(t.reviews.kind, 'review')));

    // Simulate the pre-L-06 state: the review exists with 2 old, unmarked findings.
    await pg.handle.db.delete(t.findings).where(eq(t.findings.reviewId, review!.id));
    await pg.handle.db.insert(t.findings).values([
      {
        reviewId: review!.id,
        file: 'src/legacy.ts',
        startLine: 1,
        endLine: 2,
        severity: 'WARNING',
        category: 'style',
        title: 'Old unmarked finding A',
        rationale: 'pre-existing',
        confidence: 0.7,
      },
      {
        reviewId: review!.id,
        file: 'src/legacy.ts',
        startLine: 3,
        endLine: 4,
        severity: 'WARNING',
        category: 'style',
        title: 'Old unmarked finding B',
        rationale: 'pre-existing',
        confidence: 0.7,
      },
    ]);

    // Re-running seed() must replace the unmarked pair with the full, resolved set.
    await seed(pg.handle.db);

    const findings = await pg.handle.db
      .select()
      .from(t.findings)
      .where(eq(t.findings.reviewId, review!.id));
    expect(findings.length).toBeGreaterThanOrEqual(10);
    expect(findings.length).toBeLessThanOrEqual(12);
    for (const f of findings) {
      const hasAccepted = f.acceptedAt !== null;
      const hasDismissed = f.dismissedAt !== null;
      expect(hasAccepted !== hasDismissed).toBe(true);
    }

    // AC-69/AC-71: the replaced set is not just "10-12 resolved rows" — it must
    // still give the eval pipeline ≥8 convertible (kind='finding') findings and
    // ≥3 dismissed findings sharing a file with an accepted one, same as the
    // fresh-DB case above. A naive replace that drops the file overlap would
    // pass the count/resolved checks above and still starve AC-71's D-9 rule.
    const convertible = findings.filter((f) => f.kind === 'finding');
    expect(convertible.length).toBeGreaterThanOrEqual(8);

    const acceptedFiles = new Set(findings.filter((f) => f.acceptedAt !== null).map((f) => f.file));
    const dismissedInAcceptedFiles = findings.filter(
      (f) => f.dismissedAt !== null && acceptedFiles.has(f.file),
    );
    expect(dismissedInAcceptedFiles.length).toBeGreaterThanOrEqual(3);

    // Idempotent from here on: a further seed() must not change the count.
    const countAfterReplace = findings.length;
    await seed(pg.handle.db);
    const findingsAfter = await pg.handle.db
      .select()
      .from(t.findings)
      .where(eq(t.findings.reviewId, review!.id));
    expect(findingsAfter.length).toBe(countAfterReplace);
  });

  it('(f) re-running seed() does not change the row count of any of the four tables', async () => {
    await seed(pg.handle.db); // first call, already ran in beforeAll-adjacent tests too — idempotent regardless

    const [workspace] = await pg.handle.db
      .select()
      .from(t.workspaces)
      .where(eq(t.workspaces.name, 'default'));
    const [repo] = await pg.handle.db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspace!.id), eq(t.repos.fullName, 'acme/payments-api')));
    const [pr] = await pg.handle.db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.repoId, repo!.id), eq(t.pullRequests.number, 482)));

    const countBefore = {
      files: (await pg.handle.db.select().from(t.prFiles).where(eq(t.prFiles.prId, pr!.id))).length,
      reviews: (
        await pg.handle.db.select().from(t.reviews).where(eq(t.reviews.prId, pr!.id))
      ).length,
    };
    const [reviewBefore] = await pg.handle.db
      .select()
      .from(t.reviews)
      .where(and(eq(t.reviews.prId, pr!.id), eq(t.reviews.kind, 'review')));
    const findingsBefore = (
      await pg.handle.db.select().from(t.findings).where(eq(t.findings.reviewId, reviewBefore!.id))
    ).length;

    await seed(pg.handle.db); // second call — must be a pure no-op on row counts

    const countAfter = {
      files: (await pg.handle.db.select().from(t.prFiles).where(eq(t.prFiles.prId, pr!.id))).length,
      reviews: (
        await pg.handle.db.select().from(t.reviews).where(eq(t.reviews.prId, pr!.id))
      ).length,
    };
    const [reviewAfter] = await pg.handle.db
      .select()
      .from(t.reviews)
      .where(and(eq(t.reviews.prId, pr!.id), eq(t.reviews.kind, 'review')));
    const findingsAfter = (
      await pg.handle.db.select().from(t.findings).where(eq(t.findings.reviewId, reviewAfter!.id))
    ).length;

    expect(countAfter.files).toBe(countBefore.files);
    expect(countAfter.reviews).toBe(countBefore.reviews);
    expect(findingsAfter).toBe(findingsBefore);

    // Seeds only INPUTS — no eval_cases/eval_runs/eval_run_batches rows.
    const evalCases = await pg.handle.db.select().from(t.evalCases);
    const evalRuns = await pg.handle.db.select().from(t.evalRuns);
    const evalBatches = await pg.handle.db.select().from(t.evalRunBatches);
    expect(evalCases.length).toBe(0);
    expect(evalRuns.length).toBe(0);
    expect(evalBatches.length).toBe(0);
  });
});
