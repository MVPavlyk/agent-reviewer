import type { Container } from '../../platform/container.js';
import type {
  GitHubClient,
  PrMeta,
  PrDetail,
  PrReviewComment,
  PrCommentInput,
  SmartDiff,
} from '@devdigest/shared';
import { AppError, NotFoundError } from '../../platform/errors.js';
import { PullsRepository, type PullRow, type RepoRow } from './repository.js';
import { deriveReviewStatus } from './status.js';
import { buildSmartDiff } from './smart-diff.js';

/** Structural logger — routes pass `req.log` (pino); tests can pass a stub or
 *  omit it entirely. */
export type Logger = {
  warn: (obj: unknown, msg?: string) => void;
};

const BACKFILL_LIMIT = 10;

/**
 * F1 — pulls service. Business logic for PR import/detail:
 *   - list PRs for a repo, syncing from GitHub and backfilling diff stats
 *   - full PR detail, refreshing from GitHub when possible
 *   - inline review comments (proxied live to GitHub, no local persistence)
 *
 * Local-first throughout: a GitHub failure never fails the read — it falls
 * back to whatever is already persisted (seeded or previously imported).
 * Review trigger is MANUAL and owned by A2 — this module only imports/reads.
 */
export class PullsService {
  private repo: PullsRepository;

  constructor(private container: Container) {
    this.repo = new PullsRepository(container.db);
  }

  private async githubOrNull(logger?: Logger): Promise<GitHubClient | null> {
    try {
      return await this.container.github();
    } catch (err) {
      logger?.warn({ err }, 'GitHub client unavailable (no token / offline); serving persisted PRs');
      return null;
    }
  }

  async listForRepo(workspaceId: string, repoId: string, logger?: Logger): Promise<PrMeta[]> {
    const repo = await this.repo.getRepo(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    // Local-first: sync from GitHub when a token is configured, but never
    // fail the read — already-imported/seeded PRs stay viewable offline.
    const gh = await this.githubOrNull(logger);
    if (gh) {
      try {
        const pulls = await gh.listPullRequests({ owner: repo.owner, name: repo.name });
        for (const pr of pulls) {
          await this.repo.upsertFromGitHub(workspaceId, repo.id, pr);
        }
      } catch (err) {
        logger?.warn({ err }, 'GitHub PR sync skipped (no token / offline); serving persisted PRs');
      }
    }

    const rows = await this.repo.listForRepo(repo.id);
    if (gh) {
      await this.backfillMissingDiffStats(rows, repo, gh, logger);
    }

    const prIds = rows.map((r) => r.id);
    const [latestReviewByPr, costByPrId, findingsByPrId] = await Promise.all([
      this.repo.latestReviewScoreByPr(prIds),
      this.repo.costByPr(prIds),
      this.repo.findingsByPr(prIds),
    ]);

    const now = Date.now();
    return rows.map((r) => {
      const review = latestReviewByPr.get(r.id);
      return {
        id: r.id,
        number: r.number,
        title: r.title,
        author: r.author,
        branch: r.branch,
        base: r.base,
        head_sha: r.headSha,
        additions: r.additions,
        deletions: r.deletions,
        files_count: r.filesCount,
        status: deriveReviewStatus({
          ghStatus: r.status,
          lastReviewedSha: r.lastReviewedSha,
          headSha: r.headSha,
          updatedAt: r.updatedAt,
          now,
        }),
        opened_at: r.openedAt?.toISOString() ?? null,
        updated_at: r.updatedAt?.toISOString() ?? null,
        score: review ? review.score : null,
        cost_usd: costByPrId.get(r.id) ?? null,
        findings: findingsByPrId.get(r.id) ?? null,
      };
    });
  }

  /** Diff stats aren't on GitHub's PR-list payload, so freshly-imported PRs
   *  land with zeroed size/diff. Backfill them once from the detail endpoint
   *  so the list shows real S/M/L + ± counts. Capped per request (each
   *  backfill is a detail fetch) — the periodic refetch chips away at any
   *  remainder. Mutates `rows` in place so the caller's response reflects the
   *  backfilled values without a second read. */
  private async backfillMissingDiffStats(
    rows: PullRow[],
    repo: RepoRow,
    gh: GitHubClient,
    logger?: Logger,
  ): Promise<void> {
    const needStats = rows
      .filter((r) => r.additions === 0 && r.deletions === 0 && r.filesCount === 0)
      .slice(0, BACKFILL_LIMIT);
    for (const r of needStats) {
      try {
        const detail = await gh.getPullRequest({ owner: repo.owner, name: repo.name }, r.number);
        await this.repo.backfillDiffStats(r.id, {
          additions: detail.additions,
          deletions: detail.deletions,
          filesCount: detail.files_count,
        });
        r.additions = detail.additions;
        r.deletions = detail.deletions;
        r.filesCount = detail.files_count;
      } catch (err) {
        logger?.warn({ err, number: r.number }, 'PR diff-stat backfill skipped');
      }
    }
  }

  async getDetail(workspaceId: string, id: string, logger?: Logger): Promise<PrDetail> {
    const { pr, repo } = await this.resolvePrAndRepo(workspaceId, id);

    // Local-first: refresh detail from GitHub when a token is configured;
    // otherwise serve the persisted files/commits/body (seeded or previously
    // imported) so PR detail works offline.
    try {
      const gh = await this.container.github();
      const detail = await gh.getPullRequest({ owner: repo.owner, name: repo.name }, pr.number);
      await this.repo.replaceDetail(pr.id, detail);
      return { ...detail, id: pr.id };
    } catch (err) {
      logger?.warn(
        { err },
        'GitHub PR detail refresh skipped (no token / offline); serving persisted detail',
      );
      const [files, commits] = await Promise.all([
        this.repo.listFiles(pr.id),
        this.repo.listCommits(pr.id),
      ]);
      return {
        id: pr.id,
        number: pr.number,
        title: pr.title,
        author: pr.author,
        branch: pr.branch,
        base: pr.base,
        head_sha: pr.headSha,
        additions: pr.additions,
        deletions: pr.deletions,
        files_count: pr.filesCount,
        status: pr.status as PrDetail['status'],
        opened_at: pr.openedAt?.toISOString() ?? null,
        updated_at: pr.updatedAt?.toISOString() ?? null,
        body: pr.body ?? null,
        files: files.map((f) => ({
          path: f.path,
          additions: f.additions,
          deletions: f.deletions,
          patch: f.patch ?? null,
        })),
        commits: commits.map((c) => ({
          sha: c.sha,
          message: c.message,
          author: c.author,
          committed_at: c.committedAt?.toISOString() ?? null,
        })),
      };
    }
  }

  /** Smart Diff — deterministic file classification + latest-review finding
   *  lines, no GitHub call and no LLM call. Reads only what's already
   *  persisted (`getDetail` fills `pr_files` on every PR open), so this stays
   *  fast and works offline. */
  async getSmartDiff(workspaceId: string, id: string): Promise<SmartDiff> {
    const { pr } = await this.resolvePrAndRepo(workspaceId, id);
    const [files, findingLines] = await Promise.all([
      this.repo.listFiles(pr.id),
      this.repo.latestReviewFindingLines(pr.id),
    ]);
    return buildSmartDiff(files, findingLines);
  }

  // ---- Inline review comments (Files changed tab) -------------------------
  // Proxied live to GitHub (no local persistence): GET reflects existing PR
  // comments; POST creates one immediately. Keeps the tab in lock-step with
  // GitHub and avoids a stale local mirror.

  private async resolvePrAndRepo(
    workspaceId: string,
    id: string,
  ): Promise<{ pr: PullRow; repo: RepoRow }> {
    const pr = await this.repo.getPr(workspaceId, id);
    if (!pr) throw new NotFoundError('Pull request not found');
    const repo = await this.repo.getRepoById(pr.repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    return { pr, repo };
  }

  async listComments(workspaceId: string, id: string, logger?: Logger): Promise<PrReviewComment[]> {
    const { pr, repo } = await this.resolvePrAndRepo(workspaceId, id);
    const gh = await this.githubOrNull(logger);
    if (!gh) return [];
    try {
      return await gh.listReviewComments({ owner: repo.owner, name: repo.name }, pr.number);
    } catch (err) {
      logger?.warn({ err }, 'GitHub review-comments fetch skipped (offline / error)');
      return [];
    }
  }

  async postComment(
    workspaceId: string,
    id: string,
    input: PrCommentInput,
  ): Promise<PrReviewComment> {
    const { pr, repo } = await this.resolvePrAndRepo(workspaceId, id);
    let gh: GitHubClient;
    try {
      gh = await this.container.github();
    } catch {
      throw new AppError('github_unavailable', 'Connect a GitHub token to post comments.', 400);
    }
    try {
      return await gh.createReviewComment({ owner: repo.owner, name: repo.name }, pr.number, {
        commitId: pr.headSha,
        path: input.path,
        line: input.line,
        ...(input.side ? { side: input.side } : {}),
        body: input.body,
        ...(input.in_reply_to != null ? { inReplyTo: input.in_reply_to } : {}),
      });
    } catch (err) {
      // GitHub rejects comments on lines outside the diff / on closed PRs (422).
      const msg = err instanceof Error ? err.message : 'Failed to post the comment to GitHub.';
      throw new AppError('github_comment_failed', msg, 400, { cause: String(err) });
    }
  }
}
