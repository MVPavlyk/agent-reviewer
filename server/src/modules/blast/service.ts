import type { BlastRadius } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { BlastRepository } from './repository.js';
import { normalizeChangedPaths } from './blast-paths.js';
import { emptyBlastRadius, toBlastRadius } from './shape.js';

/**
 * blast — application service. Thin transport+shaping layer: resolves the
 * PR to a repo/changed-files context, normalizes paths, then delegates ALL
 * graph/SQL/degradation logic to the `RepoIntel` facade (never a repo-intel
 * repository or table directly — R1).
 */
export class BlastService {
  private repo: BlastRepository;

  constructor(private container: Container) {
    this.repo = new BlastRepository(container.db);
  }

  async getForPr(workspaceId: string, prId: string): Promise<BlastRadius> {
    const ctx = await this.repo.getPrContext(workspaceId, prId);
    if (!ctx) throw new NotFoundError('Pull request not found');

    const changedFiles = normalizeChangedPaths(ctx.changedFiles);

    // `pr_files` is filled lazily by `GET /pulls/:id` (pulls/service.ts
    // getDetail), not on import — a PR nobody has opened yet has zero rows
    // even though GitHub reports files. Reporting `status: 'ok'` here would
    // read as "verified, no impact" when we actually have no diff to check —
    // exactly the masking requirement 6 forbids. A genuinely file-less PR
    // (expectedFileCount === 0) still falls through to the real facade call
    // below and gets its legitimate `status: 'ok'`.
    if (changedFiles.length === 0 && ctx.expectedFileCount > 0) {
      return emptyBlastRadius(
        ctx.headSha,
        'diff_not_loaded',
        "This PR's file list hasn't been loaded yet — open its Overview or Files tab once, then refresh.",
      );
    }

    const result = await this.container.repoIntel.getBlastRadius(ctx.repoId, changedFiles, {
      source: 'index',
    });
    return toBlastRadius(result, ctx.headSha);
  }
}
