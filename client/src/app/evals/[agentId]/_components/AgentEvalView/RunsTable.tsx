/* RunsTable — one row per eval run batch, newest first, with a checkbox per
   row feeding the Compare flow. Selection is controlled by the parent
   (`AgentEvalView`) — at most two checked at once; a third checkbox is
   disabled rather than silently evicting an earlier pick. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { formatMetric } from "@/components/eval-metric/format";
import { formatCost } from "@/components/run-cost-badge/format";
import type { EvalBatchRecord } from "@devdigest/shared";
import { byRecency, passLabel, versionLabel } from "./helpers";
import { s } from "./styles";

export function RunsTable({
  batches,
  selectedIds,
  onToggle,
}: {
  batches: EvalBatchRecord[];
  selectedIds: string[];
  onToggle: (batchId: string) => void;
}) {
  const t = useTranslations("eval");
  const rows = byRecency(batches);

  return (
    <table style={s.table}>
      <thead>
        <tr>
          <th style={s.th} />
          <th style={s.th}>{t("dashboard.table.ranAt")}</th>
          <th style={s.th}>{t("agentEval.table.version")}</th>
          <th style={s.th}>{t("dashboard.table.recall")}</th>
          <th style={s.th}>{t("dashboard.table.precision")}</th>
          <th style={s.th}>{t("dashboard.table.citation")}</th>
          <th style={s.th}>{t("dashboard.table.pass")}</th>
          <th style={s.th}>{t("dashboard.table.cost")}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((batch) => {
          const checked = selectedIds.includes(batch.id);
          const ranAt = new Date(batch.started_at).toLocaleString();
          return (
            <tr key={batch.id}>
              <td style={s.td}>
                <input
                  type="checkbox"
                  aria-label={t("agentEval.table.selectRun", { date: ranAt })}
                  checked={checked}
                  disabled={!checked && selectedIds.length >= 2}
                  onChange={() => onToggle(batch.id)}
                />
              </td>
              <td style={s.td}>{ranAt}</td>
              <td style={s.td}>{versionLabel(batch.agent_version)}</td>
              <td style={s.td}>{formatMetric(batch.recall)}</td>
              <td style={s.td}>{formatMetric(batch.precision)}</td>
              <td style={s.td}>{formatMetric(batch.citation_accuracy)}</td>
              <td style={s.td}>{passLabel(batch)}</td>
              <td style={s.td}>{formatCost(batch.cost_usd)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
