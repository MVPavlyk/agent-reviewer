/* InstallationsList — one row per CI installation: repo, "GitHub Actions"
   badge, latest-run status pill (text, not color-only — NFR-3), relative
   install/run time, workflow version, and a PR link when one exists.
   Each installation's recent run history (ADDENDUM v2, item 4) renders
   inline below its row. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button } from "@devdigest/ui";
import type { CiInstallationStatus } from "@/lib/hooks/ci";
import { relativeTime, runStatusKey, sortedRuns } from "./helpers";
import { s } from "./styles";

export function InstallationsList({
  installations,
  onAddRepository,
}: {
  installations: CiInstallationStatus[];
  onAddRepository: () => void;
}) {
  const tCi = useTranslations("ci");

  return (
    <div style={s.section}>
      <div style={s.installList}>
        {installations.map(({ installation, last_run, runs }) => {
          const statusKey = runStatusKey(last_run?.status);
          const timeIso = last_run?.ran_at ?? installation.installed_at;
          const history = sortedRuns(runs);

          return (
            <div key={installation.id} style={s.installCard}>
              <div style={s.installRow}>
                <span style={s.repoName}>{installation.repo}</span>
                <Badge>{tCi("ciTab.githubActions")}</Badge>
                <Badge>{tCi(`ciTab.runStatus.${statusKey}`)}</Badge>
                <span style={s.meta}>{tCi("ciTab.installed", { relative: relativeTime(timeIso) })}</span>
                {installation.workflow_version && (
                  <span style={s.meta}>{tCi("ciTab.workflowVersion", { version: installation.workflow_version })}</span>
                )}
                <span style={s.spacer} />
                {installation.pr_url && (
                  <a href={installation.pr_url} target="_blank" rel="noreferrer">
                    {tCi("ciTab.viewPr")}
                  </a>
                )}
              </div>

              <div>
                <div style={s.historyLabel}>{tCi("ciTab.history.heading")}</div>
                {history.length === 0 ? (
                  <div style={s.historyEmpty}>{tCi("ciTab.history.empty")}</div>
                ) : (
                  <div style={s.historyList}>
                    {history.map((run) => (
                      <div key={run.id} style={s.historyRow}>
                        <span>{run.pr_number != null ? tCi("ciTab.history.prLabel", { number: run.pr_number }) : "—"}</span>
                        <span>{tCi(`ciTab.runStatus.${runStatusKey(run.status)}`)}</span>
                        <span>{relativeTime(run.ran_at)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div style={s.footerAdd}>
        <Button kind="secondary" icon="Plus" onClick={onAddRepository}>
          {tCi("ciTab.addRepository")}
        </Button>
      </div>
    </div>
  );
}
