import { and, desc, eq, inArray, isNull, sum } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { PrMeta, PrDetail, SeverityCounts } from '@devdigest/shared';
import { rollupSeverities } from './status.js';

export type PullRow = typeof t.pullRequests.$inferSelect;
export type RepoRow = typeof t.repos.$inferSelect;

/**
 * F1 — pulls data access. Owns `pull_requests`, `pr_files`, `pr_commits` reads
 * and writes, plus the cost/findings rollup queries the PR list needs. No
 * GitHub calls live here — the service decides when to sync/refresh and hands
 * this repository plain rows to persist.
 */
export class PullsRepository {
  constructor(private db: Db) {}

  async getRepo(workspaceId: string, repoId: string): Promise<RepoRow | null> {
    const [repo] = await this.db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return repo ?? null;
  }

  /** Unscoped lookup — used once the PR row itself has already been
   *  workspace-checked via `getPr`. */
  async getRepoById(repoId: string): Promise<RepoRow | null> {
    const [repo] = await this.db.select().from(t.repos).where(eq(t.repos.id, repoId));
    return repo ?? null;
  }

  async getPr(workspaceId: string, id: string): Promise<PullRow | null> {
    const [pr] = await this.db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, id)));
    return pr ?? null;
  }

  async listForRepo(repoId: string): Promise<PullRow[]> {
    return this.db.select().from(t.pullRequests).where(eq(t.pullRequests.repoId, repoId));
  }

  /** Upsert one PR from a GitHub list-item (idempotent on repo_id+number).
   *  Shared by the pulls-list sync and the polling module's manual refresh —
   *  the single place this upsert shape is written. */
  async upsertFromGitHub(workspaceId: string, repoId: string, pr: PrMeta): Promise<void> {
    await this.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId,
        number: pr.number,
        title: pr.title,
        author: pr.author,
        branch: pr.branch,
        base: pr.base,
        headSha: pr.head_sha,
        additions: pr.additions,
        deletions: pr.deletions,
        filesCount: pr.files_count,
        status: pr.status,
        openedAt: pr.opened_at ? new Date(pr.opened_at) : null,
        updatedAt: pr.updated_at ? new Date(pr.updated_at) : null,
      })
      .onConflictDoUpdate({
        target: [t.pullRequests.repoId, t.pullRequests.number],
        set: {
          title: pr.title,
          headSha: pr.head_sha,
          status: pr.status,
          updatedAt: pr.updated_at ? new Date(pr.updated_at) : null,
        },
      });
  }

  async backfillDiffStats(
    id: string,
    stats: { additions: number; deletions: number; filesCount: number },
  ): Promise<void> {
    await this.db.update(t.pullRequests).set(stats).where(eq(t.pullRequests.id, id));
  }

  /** Replace the persisted files/commits/body/diff-stats for a PR with a
   *  fresh GitHub detail fetch. Wrapped in one transaction — unwrapped, a
   *  failure mid-sequence (e.g. the insert throwing after the delete
   *  succeeded) used to leave the PR with zero files/commits until the next
   *  successful refresh. */
  async replaceDetail(prId: string, detail: PrDetail): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(t.prFiles).where(eq(t.prFiles.prId, prId));
      if (detail.files.length > 0) {
        await tx.insert(t.prFiles).values(
          detail.files.map((f) => ({
            prId,
            path: f.path,
            additions: f.additions,
            deletions: f.deletions,
            patch: f.patch ?? null,
          })),
        );
      }
      await tx.delete(t.prCommits).where(eq(t.prCommits.prId, prId));
      if (detail.commits.length > 0) {
        await tx.insert(t.prCommits).values(
          detail.commits.map((c) => ({
            prId,
            sha: c.sha,
            message: c.message,
            author: c.author,
            committedAt: c.committed_at ? new Date(c.committed_at) : null,
          })),
        );
      }
      await tx
        .update(t.pullRequests)
        .set({
          body: detail.body ?? null,
          // Diff stats aren't on GitHub's PR-list payload — backfill them from
          // the detail fetch so the Pull Requests list shows real size/files.
          additions: detail.additions,
          deletions: detail.deletions,
          filesCount: detail.files_count,
        })
        .where(eq(t.pullRequests.id, prId));
    });
  }

  async listFiles(prId: string) {
    return this.db.select().from(t.prFiles).where(eq(t.prFiles.prId, prId));
  }

  async listCommits(prId: string) {
    return this.db.select().from(t.prCommits).where(eq(t.prCommits.prId, prId));
  }

  /** Latest-review SCORE per PR for the list's score ring. Computed on read
   *  from reviews (no FK denorm); the list is small, so one IN-query + JS
   *  grouping is cheap. */
  async latestReviewScoreByPr(prIds: string[]): Promise<Map<string, { score: number | null }>> {
    const out = new Map<string, { score: number | null }>();
    if (prIds.length === 0) return out;
    const reviewRows = await this.db
      .select({ prId: t.reviews.prId, score: t.reviews.score })
      .from(t.reviews)
      .where(and(inArray(t.reviews.prId, prIds), eq(t.reviews.kind, 'review')))
      .orderBy(desc(t.reviews.createdAt));
    // Rows are newest-first → first seen per PR is the latest review.
    for (const rv of reviewRows) {
      if (!out.has(rv.prId)) out.set(rv.prId, { score: rv.score });
    }
    return out;
  }

  /** SUM(cost_usd) per PR. Postgres' SUM skips NULLs and returns NULL when
   *  every row is NULL, so a PR with no priced run is absent from the map. */
  async costByPr(prIds: string[]): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (prIds.length === 0) return out;
    const rows = await this.db
      .select({ prId: t.agentRuns.prId, cost: sum(t.agentRuns.costUsd) })
      .from(t.agentRuns)
      .where(inArray(t.agentRuns.prId, prIds))
      .groupBy(t.agentRuns.prId);
    for (const r of rows) {
      const n = r.cost == null ? null : Number(r.cost);
      if (r.prId && n != null && Number.isFinite(n)) out.set(r.prId, n);
    }
    return out;
  }

  /** Severity breakdown per PR, across all `kind: 'review'` reviews, excluding
   *  dismissed findings. One IN-query joining findings → reviews (findings has
   *  no pr_id of its own) + JS grouping — same "list is small" rationale as
   *  costByPr/the score query above. A PR with no (non-dismissed) findings is
   *  absent from the map. */
  async findingsByPr(prIds: string[]): Promise<Map<string, SeverityCounts>> {
    const out = new Map<string, SeverityCounts>();
    if (prIds.length === 0) return out;
    const rows = await this.db
      .select({ prId: t.reviews.prId, severity: t.findings.severity })
      .from(t.findings)
      .innerJoin(t.reviews, eq(t.findings.reviewId, t.reviews.id))
      .where(
        and(
          inArray(t.reviews.prId, prIds),
          eq(t.reviews.kind, 'review'),
          isNull(t.findings.dismissedAt),
        ),
      );
    const byPr = new Map<string, { severity: string }[]>();
    for (const r of rows) {
      const list = byPr.get(r.prId) ?? [];
      list.push({ severity: r.severity });
      byPr.set(r.prId, list);
    }
    for (const [prId, list] of byPr) out.set(prId, rollupSeverities(list));
    return out;
  }
}
