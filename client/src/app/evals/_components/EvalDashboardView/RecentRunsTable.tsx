/* RecentRunsTable — one row per agent's latest batch, newest first. Never
   rendered for an agent that has never run (see helpers.ts::recentRuns) —
   this table has no "0 runs" row (AC-58/EC-11). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { formatMetric } from "@/components/eval-metric/format";
import { formatCost } from "@/components/run-cost-badge/format";
import type { RecentRunRow } from "./helpers";
import { passLabel } from "./helpers";
import { s } from "./styles";

export function RecentRunsTable({ runs }: { runs: RecentRunRow[] }) {
  const t = useTranslations("eval");
  return (
    <table style={s.table}>
      <thead>
        <tr>
          <th style={s.th}>{t("dashboard.table.ranAt")}</th>
          <th style={s.th}>{t("dashboard.table.recall")}</th>
          <th style={s.th}>{t("dashboard.table.precision")}</th>
          <th style={s.th}>{t("dashboard.table.citation")}</th>
          <th style={s.th}>{t("dashboard.table.pass")}</th>
          <th style={s.th}>{t("dashboard.table.cost")}</th>
        </tr>
      </thead>
      <tbody>
        {runs.map((row) => (
          <tr key={row.batch.id}>
            <td style={s.td}>
              {row.agent_name} · {new Date(row.batch.started_at).toLocaleString()}
            </td>
            <td style={s.td}>{formatMetric(row.batch.recall)}</td>
            <td style={s.td}>{formatMetric(row.batch.precision)}</td>
            <td style={s.td}>{formatMetric(row.batch.citation_accuracy)}</td>
            <td style={s.td}>{passLabel(row.batch)}</td>
            <td style={s.td}>{formatCost(row.batch.cost_usd)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
