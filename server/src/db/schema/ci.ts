import { pgTable, uuid, text, integer, timestamp, doublePrecision, unique } from 'drizzle-orm/pg-core';
import { agents } from './agents';
import { agentRuns } from './runs';

export const ciInstallations = pgTable('ci_installations', {
  id: uuid('id').primaryKey().defaultRandom(),
  agentId: uuid('agent_id')
    .notNull()
    .references(() => agents.id, { onDelete: 'cascade' }),
  repo: text('repo').notNull(),
  targetType: text('target_type', { enum: ['gha', 'circle', 'jenkins', 'cli'] }).notNull(),
  installedAt: timestamp('installed_at', { withTimezone: true }).defaultNow().notNull(),
  // ADDENDUM v2 decision 7 — ingest auth contract. Only the HASH is ever
  // stored (sha256 of the bearer token shown once at export time, see
  // `modules/ci/ingest-token.ts:hashIngestToken`); the plaintext never
  // reaches this table or a log. Nullable: rows from
  // before this pass (and rows created by the `open_pr` preview path, which
  // never persists) have no token yet.
  ingestTokenHash: text('ingest_token_hash'),
  // Embedded `WORKFLOW_VERSION` (workflow.ts) captured at export time so the
  // CI tab can show which generation produced the installed workflow.
  workflowVersion: text('workflow_version'),
  // Set when `action:'open_pr'` succeeds (Pass 5) — the opened PR's URL.
  prUrl: text('pr_url'),
});

export const ciRuns = pgTable(
  'ci_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ciInstallationId: uuid('ci_installation_id').references(() => ciInstallations.id, {
      onDelete: 'set null',
    }),
    prNumber: integer('pr_number'),
    ranAt: timestamp('ran_at', { withTimezone: true }),
    status: text('status'),
    findingsCount: integer('findings_count'),
    costUsd: doublePrecision('cost_usd'),
    githubUrl: text('github_url'),
    source: text('source'),
    // Run wall-clock duration, milliseconds — matches `CiResultArtifact.duration_ms`
    // (the ingested artifact shape, `contracts/eval-ci.ts`) 1:1, no unit
    // conversion needed at ingest time (Pass 6).
    durationMs: integer('duration_ms'),
    // Review verdict (request_changes/approve/comment, `contracts/findings.ts`
    // `Verdict`) — distinct from `status` (succeeded/failed/no_findings/running,
    // `CiRunStatus`): status describes whether the RUN completed, verdict
    // describes what the REVIEW concluded. CI Runs page addendum column list
    // needs both.
    verdict: text('verdict'),
    // W3 — the commit SHA the artifact was produced for (from the generated
    // workflow's `X-Devdigest-Commit-Sha` header, already validated as a
    // well-formed SHA before this is set — `modules/ci/ingest.ts`
    // `isWellFormedCommitSha`). Paired with `ciInstallationId` in the unique
    // constraint below so a duplicate ingest for the same commit is a no-op,
    // not a second row.
    commitSha: text('commit_sha'),
    // Direct link to the `agent_runs` row written in the SAME dual-write
    // (Pass 6) — lets a duplicate-ingest lookup return BOTH ids without a
    // second, unrelated join. Nullable only for pre-existing rows written
    // before this column existed.
    agentRunId: uuid('agent_run_id').references(() => agentRuns.id, { onDelete: 'set null' }),
  },
  (table) => [
    // W3 — ingest idempotency: a duplicate `(installation, commit_sha)` pair
    // must not insert a second row. A NULL `commitSha`/`ciInstallationId`
    // never conflicts with anything (standard SQL NULL-distinct semantics),
    // so this only constrains rows that actually carry both values.
    unique('ci_runs_installation_commit_unique').on(table.ciInstallationId, table.commitSha),
  ],
);
