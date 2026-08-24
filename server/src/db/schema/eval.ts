import { pgTable, uuid, text, integer, boolean, jsonb, timestamp, doublePrecision, index } from 'drizzle-orm/pg-core';
import { workspaces } from './core';
import { agents } from './agents';
import { pullRequests } from './pulls';

// ============================================================ Eval / Conformance / Compose

export const evalCases = pgTable('eval_cases', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  ownerKind: text('owner_kind', { enum: ['skill', 'agent'] }).notNull(),
  ownerId: uuid('owner_id').notNull(),
  name: text('name').notNull(),
  inputDiff: text('input_diff'),
  inputFiles: jsonb('input_files'),
  inputMeta: jsonb('input_meta'),
  expectedOutput: jsonb('expected_output'),
  notes: text('notes'),
});

// One batch = one "run all evals for this agent" click: a snapshot of the
// agent's config at click-time (never re-read later, even if the agent's
// prompt changes mid-run) plus the fixed set of case ids it ran, and the
// already-computed aggregate metrics UI reads (NFR-1 — no on-the-fly math).
export const evalRunBatches = pgTable(
  'eval_run_batches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    agentVersion: integer('agent_version').notNull(),
    systemPromptSnapshot: text('system_prompt_snapshot').notNull(),
    systemPromptHash: text('system_prompt_hash').notNull(),
    model: text('model').notNull(),
    provider: text('provider').notNull(),
    skillSlugs: jsonb('skill_slugs'),
    caseIds: jsonb('case_ids').notNull(),
    status: text('status', { enum: ['running', 'succeeded', 'partial', 'failed'] })
      .notNull()
      .default('running'),
    recall: doublePrecision('recall'),
    precision: doublePrecision('precision'),
    citationAccuracy: doublePrecision('citation_accuracy'),
    costUsd: doublePrecision('cost_usd'),
    tracesPassed: integer('traces_passed'),
    tracesTotal: integer('traces_total'),
    durationMs: integer('duration_ms'),
    label: text('label'),
    error: text('error'),
    startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (table) => [
    // Postgres doesn't auto-index FK columns — these back the per-agent
    // batch list and the workspace-scoped dashboard/ownership checks.
    index('eval_run_batches_workspace_id_idx').on(table.workspaceId),
    index('eval_run_batches_agent_id_idx').on(table.agentId),
  ],
);

export const evalRuns = pgTable(
  'eval_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    caseId: uuid('case_id')
      .notNull()
      .references(() => evalCases.id, { onDelete: 'cascade' }),
    batchId: uuid('batch_id').references(() => evalRunBatches.id, { onDelete: 'cascade' }),
    ranAt: timestamp('ran_at', { withTimezone: true }).defaultNow().notNull(),
    actualOutput: jsonb('actual_output'),
    pass: boolean('pass'),
    recall: doublePrecision('recall'),
    precision: doublePrecision('precision'),
    citationAccuracy: doublePrecision('citation_accuracy'),
    durationMs: integer('duration_ms'),
    costUsd: doublePrecision('cost_usd'),
  },
  (table) => [index('eval_runs_batch_id_idx').on(table.batchId)],
);

export const conformanceChecks = pgTable('conformance_checks', {
  id: uuid('id').primaryKey().defaultRandom(),
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  specId: text('spec_id').notNull(),
  completenessPct: doublePrecision('completeness_pct'),
  items: jsonb('items'),
});

export const composedReviews = pgTable('composed_reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  verdict: text('verdict'),
  postedAt: timestamp('posted_at', { withTimezone: true }),
  githubReviewId: text('github_review_id'),
});
