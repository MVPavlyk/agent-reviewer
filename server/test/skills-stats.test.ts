import { describe, expect, it } from 'vitest';
import { apportionCostByCategory } from '../src/modules/skills/stats.js';

describe('apportionCostByCategory', () => {
  it('groups by category and sums the per-finding cost split', () => {
    const { findingsByCategory, totalCostUsd } = apportionCostByCategory([
      // Run A: $1.00 across 2 findings → $0.50 each.
      { category: 'bug', runCostUsd: 1, runFindingsCount: 2 },
      { category: 'security', runCostUsd: 1, runFindingsCount: 2 },
      // Run B: $2.00 across 4 findings → $0.50 each, two land in 'bug'.
      { category: 'bug', runCostUsd: 2, runFindingsCount: 4 },
      { category: 'bug', runCostUsd: 2, runFindingsCount: 4 },
    ]);

    const bug = findingsByCategory.find((r) => r.category === 'bug')!;
    const security = findingsByCategory.find((r) => r.category === 'security')!;
    expect(bug).toEqual({ category: 'bug', count: 3, costUsd: 1.5 });
    expect(security).toEqual({ category: 'security', count: 1, costUsd: 0.5 });
    expect(totalCostUsd).toBeCloseTo(2.0);
  });

  it('a finding with null run cost contributes $0, never NaN', () => {
    const { findingsByCategory, totalCostUsd } = apportionCostByCategory([
      { category: 'style', runCostUsd: null, runFindingsCount: 3 },
    ]);
    expect(findingsByCategory).toEqual([{ category: 'style', count: 1, costUsd: 0 }]);
    expect(totalCostUsd).toBe(0);
  });

  it('a finding whose run has zero findings_count contributes $0, never Infinity', () => {
    const { findingsByCategory } = apportionCostByCategory([
      { category: 'perf', runCostUsd: 5, runFindingsCount: 0 },
    ]);
    expect(findingsByCategory).toEqual([{ category: 'perf', count: 1, costUsd: 0 }]);
  });

  it('returns an empty breakdown and zero total for no rows', () => {
    const { findingsByCategory, totalCostUsd } = apportionCostByCategory([]);
    expect(findingsByCategory).toEqual([]);
    expect(totalCostUsd).toBe(0);
  });
});
