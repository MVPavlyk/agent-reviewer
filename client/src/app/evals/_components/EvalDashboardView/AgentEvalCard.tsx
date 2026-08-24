/* AgentEvalCard — one agent's regression-gate summary. Metrics come straight
   off `row.latest_batch`'s own aggregates (AC-44) — never recomputed here.
   A disabled agent (`agent_enabled === false`) renders in an explicit
   disabled state and its run control is unavailable (AC-57/EC-13). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { formatMetric } from "@/components/eval-metric/format";
import { formatCost } from "@/components/run-cost-badge/format";
import { useRunAgentEvals } from "@/lib/hooks/evals";
import type { EvalDashboardAgentRow } from "@/lib/hooks/evals";
import { passLabel, versionLabel } from "./helpers";
import { s } from "./styles";

export function AgentEvalCard({ row, onOpen }: { row: EvalDashboardAgentRow; onOpen: () => void }) {
  const t = useTranslations("eval");
  const runEvals = useRunAgentEvals(row.agent_id);
  const batch = row.latest_batch;
  const running = batch?.status === "running" || runEvals.isPending;

  return (
    <div onClick={onOpen} style={s.card(row.agent_enabled)}>
      <div style={s.cardHeader}>
        <span style={s.cardName}>{row.agent_name}</span>
        {!row.agent_enabled && <span style={s.disabledBadge}>{t("dashboard.disabled")}</span>}
      </div>

      {batch ? (
        <>
          <div style={s.tiles}>
            <div style={s.tile}>
              <div style={s.tileLabel}>{t("dashboard.metrics.recall")}</div>
              <div style={s.tileValue}>{formatMetric(batch.recall)}</div>
            </div>
            <div style={s.tile}>
              <div style={s.tileLabel}>{t("dashboard.metrics.precision")}</div>
              <div style={s.tileValue}>{formatMetric(batch.precision)}</div>
            </div>
            <div style={s.tile}>
              <div style={s.tileLabel}>{t("dashboard.metrics.citationAccuracy")}</div>
              <div style={s.tileValue}>{formatMetric(batch.citation_accuracy)}</div>
            </div>
          </div>
          <div style={s.cardMeta}>
            <span>{versionLabel(batch.agent_version)}</span>
            <span>·</span>
            <span>{passLabel(batch)}</span>
            <span>·</span>
            <span>{formatCost(batch.cost_usd)}</span>
            <span>·</span>
            <span>{new Date(batch.started_at).toLocaleString()}</span>
          </div>
        </>
      ) : (
        <div style={s.cardMeta}>{t("evalsTab.neverRun")}</div>
      )}

      <div style={s.footerRow}>
        <span>{t("dashboard.casesSummary", { count: row.cases_total, runs: row.latest_batch ? 1 : 0 })}</span>
        <Button
          kind="secondary"
          size="sm"
          icon="Play"
          disabled={!row.agent_enabled || running}
          loading={running}
          onClick={(e) => {
            e.stopPropagation();
            runEvals.mutate({});
          }}
        >
          {running ? t("dashboard.running") : t("dashboard.runEval", { count: row.cases_total })}
        </Button>
      </div>
    </div>
  );
}
