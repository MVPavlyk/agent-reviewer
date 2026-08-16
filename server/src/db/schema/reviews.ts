import { sql } from 'drizzle-orm';
import { pgTable, uuid, text, integer, jsonb, timestamp, doublePrecision, index } from 'drizzle-orm/pg-core';
import { now } from './_shared.js';
import { workspaces } from './core.js';
import { pullRequests } from './pulls';

// ============================================================ Review & findings

export const reviews = pgTable(
  'reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    prId: uuid('pr_id')
      .notNull()
      .references(() => pullRequests.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id'),
    /** The agent_run that produced this review (links the timeline run ↔ review). */
    runId: uuid('run_id'),
    kind: text('kind', { enum: ['summary', 'review'] }).notNull(),
    verdict: text('verdict'),
    summary: text('summary'),
    score: integer('score'),
    model: text('model'),
    createdAt: now(),
  },
  (table) => [
    // Postgres doesn't auto-index FK columns. These back the PR-list latest-
    // review/score lookup and findingsByPr in modules/pulls.
    index('reviews_pr_id_idx').on(table.prId),
    index('reviews_workspace_id_idx').on(table.workspaceId),
  ],
);

export const findings = pgTable(
  'findings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reviewId: uuid('review_id')
      .notNull()
      .references(() => reviews.id, { onDelete: 'cascade' }),
    file: text('file').notNull(),
    startLine: integer('start_line').notNull(),
    endLine: integer('end_line').notNull(),
    severity: text('severity').notNull(),
    category: text('category').notNull(),
    title: text('title').notNull(),
    rationale: text('rationale').notNull(),
    suggestion: text('suggestion'),
    confidence: doublePrecision('confidence').notNull(),
    kind: text('kind').notNull().default('finding'),
    trifectaComponents: jsonb('trifecta_components').$type<string[]>(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
    /** In/out-of-scope relative to the PR's Intent, set by the deterministic
     *  scope filter (reviewer-core/src/review/scope.ts); null when no intent
     *  ran for this review. */
    scope: text('scope'),
  },
  (table) => [
    // Backs the findings → reviews join used by the PR-list severity
    // rollup (findingsByPr in modules/pulls/routes.ts) — previously a seq scan.
    index('findings_review_id_idx').on(table.reviewId),
  ],
);

export const prIntent = pgTable('pr_intent', {
  prId: uuid('pr_id')
    .primaryKey()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  summary: text('summary').notNull(),
  inScope: jsonb('in_scope').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  outOfScope: jsonb('out_of_scope').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  /** 'high' | 'low' — degrades to 'low' when the classifier's own inputs
   *  (e.g. PR description) were thin. */
  confidence: text('confidence').notNull().default('high'),
  /** Which raw inputs actually fed the classification (IntentSource[]). */
  sources: jsonb('sources').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  /** Human-readable degradation notes (never silent — see intent/sources.ts). */
  missingContext: jsonb('missing_context').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
  /** Snapshot of `pull_requests.updated_at` at classification time — lets the
   *  UI detect the PR moved on since this intent was generated. */
  sourceUpdatedAt: timestamp('source_updated_at', { withTimezone: true }),
});

export const prBrief = pgTable('pr_brief', {
  prId: uuid('pr_id')
    .primaryKey()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  json: jsonb('json').notNull(),
});
