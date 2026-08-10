import type { FindingCategory } from '@devdigest/shared';

/**
 * Pure stats aggregation for the skills Stats tab (docs/specs/skills.md
 * Extension, decision E4). No I/O, no Drizzle types — the repository fetches
 * one row per finding attributed to a skill and hands it here.
 */

/** One finding attributed to a skill, plus its parent run's cost inputs. */
export interface FindingCostRow {
  category: FindingCategory;
  /** `agent_runs.cost_usd` for the run this finding came from (nullable). */
  runCostUsd: number | null;
  /** `agent_runs.findings_count` for the same run (nullable/zero-guarded). */
  runFindingsCount: number | null;
}

export interface CategoryBreakdownRow {
  category: FindingCategory;
  count: number;
  costUsd: number;
}

export interface CostApportionment {
  findingsByCategory: CategoryBreakdownRow[];
  totalCostUsd: number;
}

/**
 * Attribution is APPROXIMATE and the UI says so: findings are never
 * LLM-tagged to a specific skill, so a run's cost is split EVENLY across its
 * own findings, then grouped by category. A finding whose run has no cost or
 * no `findings_count` contributes $0 (never NaN/Infinity).
 */
export function apportionCostByCategory(rows: FindingCostRow[]): CostApportionment {
  const byCategory = new Map<FindingCategory, { count: number; costUsd: number }>();
  for (const row of rows) {
    const perFinding =
      row.runCostUsd != null && row.runFindingsCount ? row.runCostUsd / row.runFindingsCount : 0;
    const entry = byCategory.get(row.category) ?? { count: 0, costUsd: 0 };
    entry.count += 1;
    entry.costUsd += perFinding;
    byCategory.set(row.category, entry);
  }
  const findingsByCategory = [...byCategory.entries()].map(([category, v]) => ({
    category,
    count: v.count,
    costUsd: v.costUsd,
  }));
  const totalCostUsd = findingsByCategory.reduce((sum, r) => sum + r.costUsd, 0);
  return { findingsByCategory, totalCostUsd };
}
