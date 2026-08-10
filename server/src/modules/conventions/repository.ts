import { and, asc, desc, eq, inArray, ne } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * Conventions data-access. Owns `conventions` (one row per detected
 * suggestion) and `convention_scans` (one row per "Re-scan" run). Workspace-
 * scoped throughout. Mirrors `modules/skills/repository.ts`.
 */

import type { ConventionRow, ConventionScanRow } from '../../db/rows.js';
export type { ConventionRow, ConventionScanRow };

export interface InsertConvention {
  workspaceId: string;
  repoId: string;
  scanId: string;
  title: string;
  rule: string;
  evidencePath: string | null;
  startLine: number | null;
  endLine: number | null;
  evidenceSnippet: string | null;
  confidence: number | null;
}

export interface UpdateScan {
  status?: 'running' | 'done' | 'failed';
  sampleFileCount?: number;
  candidateCount?: number;
  finishedAt?: Date;
  error?: string | null;
}

export class ConventionsRepository {
  constructor(private db: Db) {}

  /**
   * `id` is a tiebreaker, not a meaningful secondary sort: every row from one
   * scan is inserted in a single batch, so they can share the exact same
   * `createdAt` (Postgres `now()` is fixed per-statement) — without a
   * deterministic tiebreaker, ties among those rows have no guaranteed order
   * and the list visibly reshuffles on every refetch (e.g. after an
   * accept/reject invalidates the query).
   */
  async listByRepo(workspaceId: string, repoId: string): Promise<ConventionRow[]> {
    return this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId)))
      .orderBy(desc(t.conventions.createdAt), asc(t.conventions.id));
  }

  async getLatestScan(
    workspaceId: string,
    repoId: string,
  ): Promise<ConventionScanRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventionScans)
      .where(
        and(
          eq(t.conventionScans.workspaceId, workspaceId),
          eq(t.conventionScans.repoId, repoId),
        ),
      )
      .orderBy(desc(t.conventionScans.startedAt))
      .limit(1);
    return row;
  }

  /** The currently-running scan for a repo, if any — used to make "Re-scan"
   *  idempotent instead of racing a second delete-then-insert against the
   *  same repo's pending rows (see server/INSIGHTS.md's repo-intel deadlock). */
  async getRunningScan(repoId: string): Promise<ConventionScanRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventionScans)
      .where(
        and(eq(t.conventionScans.repoId, repoId), eq(t.conventionScans.status, 'running')),
      )
      .limit(1);
    return row;
  }

  async insertScan(workspaceId: string, repoId: string): Promise<ConventionScanRow> {
    const [row] = await this.db
      .insert(t.conventionScans)
      .values({ workspaceId, repoId })
      .returning();
    return row!;
  }

  async updateScan(scanId: string, patch: UpdateScan): Promise<void> {
    await this.db.update(t.conventionScans).set(patch).where(eq(t.conventionScans.id, scanId));
  }

  /** Title/rule of every already-decided (accepted/rejected) convention for
   *  this repo, across all scans — feeds the rescan's exclusion digest so the
   *  LLM doesn't re-propose something the user already accepted or rejected. */
  async nonPendingByRepo(
    repoId: string,
  ): Promise<{ title: string; rule: string; status: 'accepted' | 'rejected' }[]> {
    const rows = await this.db
      .select({
        title: t.conventions.title,
        rule: t.conventions.rule,
        status: t.conventions.status,
      })
      .from(t.conventions)
      .where(and(eq(t.conventions.repoId, repoId), ne(t.conventions.status, 'pending')));
    return rows.map((r) => ({ ...r, status: r.status as 'accepted' | 'rejected' }));
  }

  /** Wipe undecided suggestions before inserting a fresh scan's candidates —
   *  never touches accepted/rejected rows (rescan semantics: see service.ts). */
  async deletePending(repoId: string): Promise<void> {
    await this.db
      .delete(t.conventions)
      .where(and(eq(t.conventions.repoId, repoId), eq(t.conventions.status, 'pending')));
  }

  async insertMany(rows: InsertConvention[]): Promise<ConventionRow[]> {
    if (rows.length === 0) return [];
    return this.db.insert(t.conventions).values(rows).returning();
  }

  async updateStatus(
    workspaceId: string,
    id: string,
    status: 'accepted' | 'rejected',
  ): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .update(t.conventions)
      .set({ status, decidedAt: new Date() })
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)))
      .returning();
    return row;
  }

  /** Bulk-reset every currently-accepted convention in a repo back to
   *  `pending` (clears `decidedAt` too). This is the "Deselect all" action —
   *  distinct from `reject`, which permanently excludes a convention from
   *  future re-suggestion; a reset just un-does the accept so it goes back to
   *  being an undecided candidate. Returns the number of rows reset. */
  async resetAcceptedByRepo(workspaceId: string, repoId: string): Promise<number> {
    const rows = await this.db
      .update(t.conventions)
      .set({ status: 'pending', decidedAt: null })
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          eq(t.conventions.status, 'accepted'),
        ),
      )
      .returning({ id: t.conventions.id });
    return rows.length;
  }

  async getByIds(workspaceId: string, ids: string[]): Promise<ConventionRow[]> {
    if (ids.length === 0) return [];
    return this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), inArray(t.conventions.id, ids)));
  }

  /** Remove conventions once they've been merged into a skill — their content
   *  now lives in the skill's body/evidence_files, so they no longer belong in
   *  the review queue. */
  async deleteByIds(workspaceId: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.db
      .delete(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), inArray(t.conventions.id, ids)));
  }
}
