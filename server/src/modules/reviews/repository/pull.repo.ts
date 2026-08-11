import { and, eq } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import type { Intent, IntentConfidence, IntentSource, PrIntentRecord } from '@devdigest/shared';
import type { PullRow } from '../../../db/rows.js';

// ---- PR lookup (workspace-scoped) -----------------------------------------

export async function getPull(
  db: Db,
  workspaceId: string,
  prId: string,
): Promise<PullRow | undefined> {
  const [row] = await db
    .select()
    .from(t.pullRequests)
    .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
  return row;
}

export async function getRepo(
  db: Db,
  repoId: string,
): Promise<typeof t.repos.$inferSelect | undefined> {
  const [row] = await db.select().from(t.repos).where(eq(t.repos.id, repoId));
  return row;
}

export async function getPrFiles(
  db: Db,
  prId: string,
): Promise<(typeof t.prFiles.$inferSelect)[]> {
  return db.select().from(t.prFiles).where(eq(t.prFiles.prId, prId));
}

/**
 * Record the commit a review just ran against, so the PR list can derive
 * `reviewed` vs `needs_review` (head moved since the last review) vs `stale`.
 */
export async function markReviewed(db: Db, prId: string, sha: string): Promise<void> {
  await db
    .update(t.pullRequests)
    .set({ lastReviewedSha: sha })
    .where(eq(t.pullRequests.id, prId));
}

// ---- intent -----------------------------------------------------------

export interface UpsertIntentInput {
  intent: Intent;
  confidence: IntentConfidence;
  sources: IntentSource[];
  missingContext: string[];
  provider: string;
  model: string;
  /** Snapshot of `pull_requests.updated_at` at classification time. */
  sourceUpdatedAt: Date | null;
}

export async function upsertIntent(db: Db, prId: string, input: UpsertIntentInput): Promise<void> {
  const values = {
    prId,
    summary: input.intent.summary,
    inScope: input.intent.in_scope,
    outOfScope: input.intent.out_of_scope,
    confidence: input.confidence,
    sources: input.sources,
    missingContext: input.missingContext,
    provider: input.provider,
    model: input.model,
    generatedAt: new Date(),
    sourceUpdatedAt: input.sourceUpdatedAt,
  };
  await db
    .insert(t.prIntent)
    .values(values)
    .onConflictDoUpdate({ target: t.prIntent.prId, set: values });
}

export async function getIntent(db: Db, prId: string): Promise<PrIntentRecord | undefined> {
  const [row] = await db.select().from(t.prIntent).where(eq(t.prIntent.prId, prId));
  if (!row) return undefined;
  return {
    pr_id: prId,
    summary: row.summary,
    in_scope: row.inScope,
    out_of_scope: row.outOfScope,
    confidence: row.confidence as IntentConfidence,
    sources: row.sources as IntentSource[],
    missing_context: row.missingContext,
    provider: row.provider,
    model: row.model,
    generated_at: row.generatedAt.toISOString(),
    source_updated_at: row.sourceUpdatedAt ? row.sourceUpdatedAt.toISOString() : null,
  };
}
