/* CiRunsView — global CI Runs page (SPEC-06 Chunk E, ADDENDUM v2 Pass 9).
   One row per `ci_runs` row visible to the workspace, newest first — a
   single `useCiRuns()` GET on mount, no polling (NFR-1). This route never
   ingests; the only writer is `POST /ci/ingest`
   (server/src/modules/ci/service.ts::ingestResult). Columns: repo · PR ·
   agent · verdict · findings · cost · duration · job link (GitHub Actions),
   per ADDENDUM v2 decision 5. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { formatCost } from "@/components/run-cost-badge/format";
import { useCiRuns } from "@/lib/hooks/ci";
import { formatDuration, repoFromGithubUrl, sortedByRanAt, verdictKey } from "./helpers";
import { s } from "./styles";

export function CiRunsView() {
  const t = useTranslations("ci");
  const { data, isLoading, isError, refetch } = useCiRuns();

  const crumb = [{ label: t("page.crumb") }];
  const runs = data ? sortedByRanAt(data) : [];

  return (
    <AppShell crumb={crumb}>
      <div style={s.wrap}>
        <h1 style={s.h1}>{t("runs.title")}</h1>
        <div style={s.subtitle}>{t("runs.subtitle")}</div>

        {isLoading && (
          <div style={s.loadingList} aria-label={t("runs.loading")}>
            <Skeleton height={40} />
            <Skeleton height={40} />
            <Skeleton height={40} />
          </div>
        )}

        {isError && <ErrorState body={t("runs.loadError")} onRetry={() => refetch()} />}

        {!isLoading && !isError && runs.length === 0 && (
          <EmptyState icon="Workflow" title={t("runs.emptyTitle")} body={t("runs.emptyBody")} />
        )}

        {!isLoading && !isError && runs.length > 0 && (
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>{t("runs.table.repo")}</th>
                <th style={s.th}>{t("runs.table.pr")}</th>
                <th style={s.th}>{t("runs.table.agent")}</th>
                <th style={s.th}>{t("runs.table.verdict")}</th>
                <th style={s.th}>{t("runs.table.findings")}</th>
                <th style={s.th}>{t("runs.table.cost")}</th>
                <th style={s.th}>{t("runs.table.duration")}</th>
                <th style={s.th}>{t("runs.table.jobLink")}</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => {
                const repo = run.repo ?? repoFromGithubUrl(run.github_url);
                return (
                  <tr key={run.id}>
                    <td style={s.td}>{repo ?? "—"}</td>
                    <td style={s.td}>{run.pr_number != null ? `#${run.pr_number}` : "—"}</td>
                    <td style={s.td}>{run.agent ?? "—"}</td>
                    <td style={s.td}>{t(`runs.verdict.${verdictKey(run.verdict)}`)}</td>
                    <td style={s.td}>{run.findings_count ?? "—"}</td>
                    <td style={s.td}>{formatCost(run.cost_usd)}</td>
                    <td style={s.td}>{formatDuration(run.duration_ms)}</td>
                    <td style={s.td}>
                      {run.github_url ? (
                        <a href={run.github_url} target="_blank" rel="noreferrer">
                          {t("runs.viewRun")}
                        </a>
                      ) : (
                        <span style={s.inactiveLink} aria-disabled="true">
                          {t("runs.noLink")}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </AppShell>
  );
}
