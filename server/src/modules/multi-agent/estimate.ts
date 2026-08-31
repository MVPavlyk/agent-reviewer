import type { AgentEstimate, AgentEstimates } from '@devdigest/shared';
import type { AgentHistoryRow } from './repository.js';

/**
 * Pure pre-run estimate math (SPEC-05 G-5, D-4/D-6). No I/O — the service
 * fetches each agent's last-N `done` runs and hands the rows here, so this
 * is unit-testable without Postgres (mirrors `skills/stats.ts`'s
 * `apportionCostByCategory` split).
 */

/** Average `durationMs`/`costUsd` over one agent's history rows. `null` (not
 *  0, not a made-up number) when the agent has no `done` runs at all
 *  (AC-20). Averages each field independently over its own non-null values,
 *  so a stray null in one field never zeroes the other out. */
export function averageAgentHistory(agentId: string, rows: AgentHistoryRow[]): AgentEstimate {
  if (rows.length === 0) return { agent_id: agentId, time_ms: null, cost_usd: null };

  const times = rows.map((r) => r.durationMs).filter((v): v is number => v != null);
  const costs = rows.map((r) => r.costUsd).filter((v): v is number => v != null);

  return {
    agent_id: agentId,
    time_ms: times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : null,
    cost_usd: costs.length > 0 ? costs.reduce((a, b) => a + b, 0) / costs.length : null,
  };
}

/** An agent "has history" once it has at least one usable per-agent value —
 *  i.e. `averageAgentHistory` didn't fall through the empty-rows branch. */
function hasHistory(estimate: AgentEstimate): boolean {
  return estimate.time_ms != null || estimate.cost_usd != null;
}

/**
 * Aggregate a set of per-agent estimates: `total_time_ms` = MAX (parallel
 * fan-out — AC-21), `total_cost_usd` = SUM (AC-21), computed ONLY from
 * agents that have history; `null` when none do (EC-7). `partial: true`
 * the moment any requested agent lacks history (AC-22), even if others do.
 */
export function aggregateEstimates(perAgent: AgentEstimate[]): Omit<AgentEstimates, 'per_agent'> {
  const withHistory = perAgent.filter(hasHistory);
  const times = withHistory.map((e) => e.time_ms).filter((v): v is number => v != null);
  const costs = withHistory.map((e) => e.cost_usd).filter((v): v is number => v != null);

  return {
    total_time_ms: times.length > 0 ? Math.max(...times) : null,
    total_cost_usd: costs.length > 0 ? costs.reduce((a, b) => a + b, 0) : null,
    partial: perAgent.some((e) => !hasHistory(e)),
  };
}
