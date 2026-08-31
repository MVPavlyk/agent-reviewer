import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  doublePrecision,
  index,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { workspaces } from './core';
import { agents } from './agents';
import { pullRequests } from './pulls';
import { skills } from './skills';

// ============================================================ Observability

export const agentRuns = pgTable(
  'agent_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),
    prId: uuid('pr_id').references(() => pullRequests.id, { onDelete: 'set null' }),
    /** Links this run to a multi-agent-run fan-out (D-1); nullable — most runs
     *  are single-agent, not part of a multi-run. FK declared lazily since
     *  `multiAgentRuns` is defined further below in this same file. */
    multiAgentRunId: uuid('multi_agent_run_id').references(() => multiAgentRuns.id, {
      onDelete: 'cascade',
    }),
    ranAt: timestamp('ran_at', { withTimezone: true }).defaultNow().notNull(),
    provider: text('provider'),
    model: text('model'),
    durationMs: integer('duration_ms'),
    tokensIn: integer('tokens_in'),
    tokensOut: integer('tokens_out'),
    costUsd: doublePrecision('cost_usd'),
    status: text('status'),
    /** Failure reason when status='failed' (LLM/API error, timeout, quota, …). */
    error: text('error'),
    source: text('source', { enum: ['local', 'ci'] }).notNull().default('local'),
    findingsCount: integer('findings_count'),
    grounding: text('grounding'),
    /** Review score (0-100) for this run; null on failed/cancelled runs. */
    score: integer('score'),
    /** Findings that tripped the agent's gate (severity ≥ ciFailOn). */
    blockers: integer('blockers'),
  },
  (table) => [
    // Postgres doesn't auto-index FK columns. These back costByPr() and the
    // PR-list/timeline queries in modules/pulls (per-PR + per-workspace scans).
    index('agent_runs_pr_id_idx').on(table.prId),
    index('agent_runs_workspace_id_idx').on(table.workspaceId),
    index('agent_runs_agent_id_idx').on(table.agentId),
    index('agent_runs_multi_agent_run_id_idx').on(table.multiAgentRunId),
  ],
);

/** Whole trace of one run as a SINGLE jsonb document. */
export const runTraces = pgTable('run_traces', {
  runId: uuid('run_id')
    .primaryKey()
    .references(() => agentRuns.id, { onDelete: 'cascade' }),
  trace: jsonb('trace').notNull(),
});

/** Which skills (and which skill VERSION) were active on a run — the
 *  attribution join for skills Stats. Written once, right after
 *  `run-executor` resolves `linkedSkills` for the run (see
 *  docs/specs/skills.md decision E4/E6). `skillVersion` snapshots
 *  `skills.version` at run time so a later body edit doesn't rewrite history. */
export const runSkills = pgTable(
  'run_skills',
  {
    runId: uuid('run_id')
      .notNull()
      .references(() => agentRuns.id, { onDelete: 'cascade' }),
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    skillVersion: integer('skill_version').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.runId, table.skillId] }),
    // Backs the Stats-tab attribution query (findings → reviews → run_skills
    // WHERE skill_id = :id), same rationale as the other FK indexes in this file.
    index('run_skills_skill_id_idx').on(table.skillId),
  ],
);

export const multiAgentRuns = pgTable('multi_agent_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  ranAt: timestamp('ran_at', { withTimezone: true }).defaultNow().notNull(),
});
