/* /evals — Eval Dashboard: one card per agent that has ≥1 eval case, each
   showing its latest batch's own pre-computed aggregates (AC-44), plus a
   table of the most recent run per agent. No batch anywhere in the
   workspace → an empty state, never a table with fabricated zeros
   (AC-58/EC-11). A disabled agent's card renders in an explicit disabled
   state and its run control is unavailable (AC-57/EC-13). Deliberately
   missing from the L-06 mockup (non-goals): "Run all agents", the "30 days"
   filter, an alert banner, and sparklines. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useEvalDashboard } from "@/lib/hooks/evals";
import { AgentEvalCard } from "./AgentEvalCard";
import { RecentRunsTable } from "./RecentRunsTable";
import { recentRuns } from "./helpers";
import { s } from "./styles";

export function EvalDashboardView() {
  const t = useTranslations("eval");
  const router = useRouter();
  const { data: rows, isLoading, isError, refetch } = useEvalDashboard();

  const crumb = [{ label: t("page.crumbSkillsLab") }, { label: t("page.crumbEvalDashboard") }];
  const runs = rows ? recentRuns(rows) : [];

  return (
    <AppShell crumb={crumb}>
      <div style={s.wrap}>
        <h1 style={s.h1}>{t("dashboard.defaultTitle")}</h1>

        {isLoading && (
          <>
            <Skeleton height={120} />
            <Skeleton height={120} />
          </>
        )}

        {isError && <ErrorState body={t("dashboard.loading")} onRetry={() => refetch()} />}

        {!isLoading && !isError && rows && rows.length === 0 && (
          <EmptyState icon="Target" title={t("dashboard.noRuns")} body={t("dashboard.configure")} />
        )}

        {!isLoading && !isError && rows && rows.length > 0 && (
          <>
            <div style={s.cards}>
              {rows.map((row) => (
                <AgentEvalCard key={row.agent_id} row={row} onOpen={() => router.push(`/evals/${row.agent_id}`)} />
              ))}
            </div>

            {runs.length > 0 && (
              <>
                <h2 style={s.h2}>{t("dashboard.recentRuns")}</h2>
                <RecentRunsTable runs={runs} />
              </>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
