import { pgTable, uuid, text, integer, jsonb, timestamp, doublePrecision, vector, index } from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { workspaces } from './core';
import { repos } from './repos';

// ============================================================ Knowledge / RAG

export const memory = pgTable(
  'memory',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id').references(() => repos.id, { onDelete: 'cascade' }),
    scope: text('scope', { enum: ['repo', 'global', 'team'] }).notNull(),
    kind: text('kind', {
      enum: ['decision', 'convention', 'preference', 'fact', 'learning'],
    }).notNull(),
    content: text('content').notNull(),
    embedding: vector('embedding', { dimensions: 1536 }),
    confidence: doublePrecision('confidence'),
    sources: jsonb('sources'),
    createdAt: now(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  (t) => ({ wsIdx: index('memory_ws_idx').on(t.workspaceId) }),
);

/** One row per "Re-scan" run — owns the run metadata the Conventions screen
 *  shows ("Detected from N sample files · last scan Xh ago") and gives
 *  `conventions.scan_id` a stable FK target instead of relying on timestamps
 *  to reconstruct which suggestions came from which scan. */
export const conventionScans = pgTable('convention_scans', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  repoId: uuid('repo_id')
    .notNull()
    .references(() => repos.id, { onDelete: 'cascade' }),
  status: text('status', { enum: ['running', 'done', 'failed'] }).notNull().default('running'),
  sampleFileCount: integer('sample_file_count').notNull().default(0),
  candidateCount: integer('candidate_count').notNull().default(0),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  error: text('error'),
});

export const conventions = pgTable('conventions', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  repoId: uuid('repo_id').references(() => repos.id, { onDelete: 'cascade' }),
  scanId: uuid('scan_id')
    .notNull()
    .references(() => conventionScans.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  rule: text('rule').notNull(),
  evidencePath: text('evidence_path'),
  startLine: integer('start_line'),
  endLine: integer('end_line'),
  evidenceSnippet: text('evidence_snippet'),
  confidence: doublePrecision('confidence'),
  status: text('status', { enum: ['pending', 'accepted', 'rejected'] })
    .notNull()
    .default('pending'),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  createdAt: now(),
});
