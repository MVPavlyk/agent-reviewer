import { describe, expect, it } from 'vitest';
import { averageAgentHistory, aggregateEstimates } from '../src/modules/multi-agent/estimate.js';

describe('averageAgentHistory', () => {
  it('AC-19: averages durationMs/costUsd over the agent last-N done runs', () => {
    const estimate = averageAgentHistory('a1', [
      { durationMs: 1000, costUsd: 0.1 },
      { durationMs: 2000, costUsd: 0.3 },
    ]);
    expect(estimate).toEqual({ agent_id: 'a1', time_ms: 1500, cost_usd: 0.2 });
  });

  it('AC-20: no history at all → null, null (never 0, never made up)', () => {
    expect(averageAgentHistory('a1', [])).toEqual({ agent_id: 'a1', time_ms: null, cost_usd: null });
  });
});

describe('aggregateEstimates', () => {
  it('AC-21: aggregate time is MAX and cost is SUM across agents with history', () => {
    const perAgent = [
      { agent_id: 'a1', time_ms: 1000, cost_usd: 0.1 },
      { agent_id: 'a2', time_ms: 3000, cost_usd: 0.2 },
    ];
    const agg = aggregateEstimates(perAgent);
    expect(agg.total_time_ms).toBe(3000);
    expect(agg.total_cost_usd).toBeCloseTo(0.3);
    expect(agg.partial).toBe(false);
  });

  it('AC-22: partial is true the moment any requested agent lacks history', () => {
    const perAgent = [
      { agent_id: 'a1', time_ms: 1000, cost_usd: 0.1 },
      { agent_id: 'a2', time_ms: null, cost_usd: null },
    ];
    const agg = aggregateEstimates(perAgent);
    expect(agg.partial).toBe(true);
    // AC-21: aggregate is still computed from the agent that DOES have history.
    expect(agg.total_time_ms).toBe(1000);
    expect(agg.total_cost_usd).toBeCloseTo(0.1);
  });

  it('EC-7: no agent in the set has any history → both aggregates null, partial true', () => {
    const perAgent = [
      { agent_id: 'a1', time_ms: null, cost_usd: null },
      { agent_id: 'a2', time_ms: null, cost_usd: null },
    ];
    const agg = aggregateEstimates(perAgent);
    expect(agg).toEqual({ total_time_ms: null, total_cost_usd: null, partial: true });
  });
});
