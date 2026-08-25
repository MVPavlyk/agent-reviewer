import { z } from 'zod';
import { Severity } from './findings.js';

/**
 * A5 — Observability / Multi-agent contracts (L07).
 *
 * These are NEW contracts (A5 owns this file; the barrel re-exports it). They
 * sit alongside A2's `review-api.ts`:
 *   - MultiAgentRun        the response of POST /pulls/:id/multi-agent-run
 *   - AgentColumn          one agent's column in the multi-agent view
 *   - Conflict / ConflictTake  where agents disagree on the same file:line
 *   - AgentStats           per-agent quality aggregates (GET /agents/:id/stats)
 *   - CuratorResult        the cross-session memory curator outcome
 *
 * The single-document run trace itself stays in `contracts/trace.ts` (RunTrace).
 */

// ---------------------------------------------------------------------------
// Multi-Agent Review
// ---------------------------------------------------------------------------

/** A finding as surfaced in a multi-agent column (subset of FindingRecord). */
export const AgentColumnFinding = z.object({
  id: z.string(),
  severity: Severity,
  category: z.string(),
  title: z.string(),
  file: z.string(),
  start_line: z.number().int(),
  kind: z.string().nullish(),
});
export type AgentColumnFinding = z.infer<typeof AgentColumnFinding>;

/** One agent's result column in the multi-agent review. */
export const AgentColumn = z.object({
  run_id: z.string(),
  agent_id: z.string(),
  agent_name: z.string(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  status: z.enum(['done', 'failed', 'running']),
  verdict: z.string().nullable(),
  score: z.number().int().nullable(),
  summary: z.string().nullable(),
  duration_ms: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  findings: z.array(AgentColumnFinding),
});
export type AgentColumn = z.infer<typeof AgentColumn>;

/** One agent's stance on a contended file:line. */
export const ConflictTake = z.object({
  agent_id: z.string(),
  persona: z.string(),
  /** Severity if the agent flagged it, or 'ignored' when it did not. */
  verdict: z.union([Severity, z.literal('ignored')]),
  note: z.string(),
});
export type ConflictTake = z.infer<typeof ConflictTake>;

/**
 * A cross-agent group at a file:line touched by ≥2 agents. A group is a
 * *conflict* when its `takes` diverge — at least one agent flagged the spot
 * and at least one other agent (that also reviewed) did NOT, OR agents
 * assigned divergent severities; otherwise it is agreement/corroboration
 * (every agent that reviewed flagged it identically). There is no separate
 * boolean field: a consumer derives which case it is from `takes` itself.
 * Computed on-read from persisted findings; not stored.
 */
export const Conflict = z.object({
  file: z.string(),
  line: z.number().int(),
  title: z.string(),
  takes: z.array(ConflictTake),
});
export type Conflict = z.infer<typeof Conflict>;

/** Response of POST /pulls/:id/multi-agent-run and GET /pulls/:id/multi-agent. */
export const MultiAgentRun = z.object({
  id: z.string(),
  pr_id: z.string(),
  pr_number: z.number().int().nullish(),
  ran_at: z.string(),
  agent_count: z.number().int(),
  total_duration_ms: z.number().int(),
  total_cost_usd: z.number().nullable(),
  columns: z.array(AgentColumn),
  conflicts: z.array(Conflict),
});
export type MultiAgentRun = z.infer<typeof MultiAgentRun>;

// ---------------------------------------------------------------------------
// Multi-agent run history (GET /multi-agent-runs) — L07.
// ---------------------------------------------------------------------------

/** One row in the multi-agent run history list — a summary, not the full
 *  `MultiAgentRun` (no columns/conflicts; those are fetched on drill-in via
 *  GET /pulls/:id/multi-agent/:multiRunId). */
export const MultiAgentRunSummary = z.object({
  id: z.string(),
  pr_id: z.string(),
  pr_number: z.number().int().nullish(),
  pr_title: z.string().nullable(),
  ran_at: z.string(),
  agent_count: z.number().int(),
  total_cost_usd: z.number().nullable(),
  total_duration_ms: z.number().int(),
});
export type MultiAgentRunSummary = z.infer<typeof MultiAgentRunSummary>;

// ---------------------------------------------------------------------------
// Pre-run estimate (GET /agents/estimates?ids=…) — SPEC-05 G-5/D-6.
// ---------------------------------------------------------------------------

/** One agent's pre-run estimate: average of its last N=5 `done` runs (D-4).
 *  Both fields are `null` (never 0 / a made-up number) when the agent has no
 *  successful run history yet (AC-20). */
export const AgentEstimate = z.object({
  agent_id: z.string(),
  time_ms: z.number().nullable(),
  cost_usd: z.number().nullable(),
});
export type AgentEstimate = z.infer<typeof AgentEstimate>;

/** Response of GET /agents/estimates. Aggregate `total_time_ms` = MAX and
 *  `total_cost_usd` = SUM, computed ONLY from agents that have history
 *  (AC-21); `partial: true` when at least one requested agent has none
 *  (AC-22). */
export const AgentEstimates = z.object({
  per_agent: z.array(AgentEstimate),
  total_time_ms: z.number().nullable(),
  total_cost_usd: z.number().nullable(),
  partial: z.boolean(),
});
export type AgentEstimates = z.infer<typeof AgentEstimates>;

// ---------------------------------------------------------------------------
// Per-agent Stats (GET /agents/:id/stats)
// ---------------------------------------------------------------------------

/** A single (date, value) point for a sparkline/trend. */
export const StatPoint = z.object({ label: z.string(), value: z.number() });
export type StatPoint = z.infer<typeof StatPoint>;

export const AgentStats = z.object({
  agent_id: z.string(),
  agent_name: z.string(),
  runs: z.number().int(),
  findings_total: z.number().int(),
  /** accept-rate is the headline quality signal. 0..1 over acted findings. */
  accepted: z.number().int(),
  dismissed: z.number().int(),
  pending: z.number().int(),
  accept_rate: z.number().nullable(),
  dismiss_rate: z.number().nullable(),
  avg_findings_per_run: z.number().nullable(),
  total_cost_usd: z.number().nullable(),
  avg_cost_usd: z.number().nullable(),
  avg_latency_ms: z.number().nullable(),
  findings_by_severity: z.object({
    CRITICAL: z.number().int(),
    WARNING: z.number().int(),
    SUGGESTION: z.number().int(),
  }),
  /** recent runs for a small trend chart (oldest→newest). */
  trend: z.array(StatPoint),
});
export type AgentStats = z.infer<typeof AgentStats>;

// ---------------------------------------------------------------------------
// Cross-session memory curator
// ---------------------------------------------------------------------------

/** A merge the curator performed (or would perform in dry-run). */
export const CuratorMerge = z.object({
  kept_id: z.string(),
  merged_ids: z.array(z.string()),
  content: z.string(),
  similarity: z.number(),
});
export type CuratorMerge = z.infer<typeof CuratorMerge>;

export const CuratorResult = z.object({
  scanned: z.number().int(),
  merges: z.array(CuratorMerge),
  removed: z.number().int(),
  dry_run: z.boolean(),
});
export type CuratorResult = z.infer<typeof CuratorResult>;
