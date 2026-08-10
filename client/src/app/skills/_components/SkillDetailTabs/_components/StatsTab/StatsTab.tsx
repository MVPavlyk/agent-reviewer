/* StatsTab — usage stats + findings-by-category breakdown for a skill
   (docs/specs/skills.md Extension). Attribution is APPROXIMATE and this tab
   says so out loud (decision E4): findings aren't LLM-tagged to a specific
   skill, so a run's cost is split evenly across its own findings, then
   counted for every skill attached to that run. */
"use client";

import { useTranslations } from "next-intl";
import { Card, ErrorState, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useSkillStats } from "@/lib/hooks/skills";
import { formatCost } from "@/components/run-cost-badge/format";
import { s } from "./styles";

function pct(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

export function StatsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const { data: stats, isLoading, isError, refetch } = useSkillStats(skill.id);

  if (isLoading) {
    return (
      <div style={s.wrap}>
        <Skeleton height={90} />
        <Skeleton height={160} />
      </div>
    );
  }
  if (isError || !stats) {
    return (
      <div style={s.wrap}>
        <ErrorState body={t("stats.loadError")} onRetry={() => refetch()} />
      </div>
    );
  }

  return (
    <div style={s.wrap}>
      <div style={s.tiles}>
        <Card style={s.tile}>
          <div style={s.tileLabel}>{t("stats.agentsCount")}</div>
          <div style={s.tileValue}>{stats.agents_count}</div>
        </Card>
        <Card style={s.tile}>
          <div style={s.tileLabel}>{t("stats.pullRate")}</div>
          <div style={s.tileValue}>{pct(stats.pull_rate)}</div>
        </Card>
        <Card style={s.tile}>
          <div style={s.tileLabel}>{t("stats.acceptRate")}</div>
          <div style={s.tileValue}>{pct(stats.accept_rate)}</div>
        </Card>
        <Card style={s.tile}>
          <div style={s.tileLabel}>{t("stats.totalCost", { days: stats.window_days })}</div>
          <div style={s.tileValue}>{formatCost(stats.total_cost_usd)}</div>
        </Card>
      </div>

      <div style={s.sectionTitle}>{t("stats.byCategory", { days: stats.window_days })}</div>
      {stats.findings_by_category.length === 0 ? (
        <div style={s.empty}>{t("stats.empty")}</div>
      ) : (
        <div style={s.categoryList}>
          {stats.findings_by_category.map((row) => (
            <div key={row.category} style={s.categoryRow}>
              <span style={s.categoryName}>{t(`stats.category.${row.category}`)}</span>
              <span style={s.categoryCount}>{row.count}</span>
              <span style={s.categoryCost}>{formatCost(row.cost_usd)}</span>
            </div>
          ))}
        </div>
      )}

      <div style={s.caveat}>{t("stats.approximateCaveat")}</div>
    </div>
  );
}
