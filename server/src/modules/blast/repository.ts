import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

export interface PrBlastContext {
  repoId: string;
  headSha: string;
  changedFiles: string[];
  /** `pull_requests.files_count` — GitHub's own count, independent of
   *  whether `pr_files` has been filled yet. Lets the service tell "this PR
   *  really has zero files" apart from "the diff hasn't been fetched yet". */
  expectedFileCount: number;
}

/**
 * blast — data access. Exactly one method: the four fields blast needs
 * (repoId, headSha, changedFiles, expectedFileCount) from `pull_requests` +
 * `pr_files`, workspace-scoped. No GitHub call here — R8: changed files come
 * straight from what `pulls` already persisted (`pr_files.path`), never a
 * live diff fetch. `PullsRepository.getPr` + `listFiles` would work too, but
 * they pull full rows for a need that's exactly four fields — a crossmodule
 * dependency (`blast -> pulls`) isn't worth it for one narrow read.
 */
export class BlastRepository {
  constructor(private db: Db) {}

  async getPrContext(workspaceId: string, prId: string): Promise<PrBlastContext | null> {
    const [pr] = await this.db
      .select({
        repoId: t.pullRequests.repoId,
        headSha: t.pullRequests.headSha,
        filesCount: t.pullRequests.filesCount,
      })
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    if (!pr) return null;

    const files = await this.db
      .select({ path: t.prFiles.path })
      .from(t.prFiles)
      .where(eq(t.prFiles.prId, prId));

    return {
      repoId: pr.repoId,
      headSha: pr.headSha,
      changedFiles: files.map((f) => f.path),
      expectedFileCount: pr.filesCount,
    };
  }
}
