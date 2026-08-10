import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { RepoRepository } from '../repos/repository.js';
import { PullsRepository } from '../pulls/repository.js';

/**
 * F1 — polling service. MANUAL refresh that ONLY syncs the PR list
 * (new/updated PRs appear, head_sha updates). It does NOT trigger any review —
 * review is manual (user presses Run Review, owned by A2).
 *
 * Reuses `PullsRepository.upsertFromGitHub` so the GitHub-sync upsert shape
 * is written in exactly one place, shared with the pulls-list sync.
 */
export class PollingService {
  private repos: RepoRepository;
  private pulls: PullsRepository;

  constructor(private container: Container) {
    this.repos = new RepoRepository(container.db);
    this.pulls = new PullsRepository(container.db);
  }

  async pollRepo(
    workspaceId: string,
    repoId: string,
  ): Promise<{ synced: number; reviewTriggered: false }> {
    const repo = await this.repos.getById(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    const gh = await this.container.github();
    const pulls = await gh.listPullRequests({ owner: repo.owner, name: repo.name });
    for (const pr of pulls) {
      await this.pulls.upsertFromGitHub(workspaceId, repo.id, pr);
    }
    await this.repos.touchLastPolledAt(repo.id);

    // NOTE: no review is triggered here — manual trigger only.
    return { synced: pulls.length, reviewTriggered: false };
  }
}
