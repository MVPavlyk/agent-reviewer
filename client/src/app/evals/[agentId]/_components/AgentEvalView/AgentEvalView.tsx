/* /evals/:agentId — one agent's eval history: a metric trend chart plus a
   runs table whose checkboxes drive the (Крок 18) Compare flow. Delta is
   relative to the immediately-previous batch; a first run has no previous
   batch and renders no delta element at all, never "▲0" (AC-60). Selection
   is local, ephemeral state (`useState`) capped at two — `Compare` is only
   ever enabled for exactly two batches of the *same* agent (EC-14), a
   predicate written against `agent_id` because `RunsTable` is reused
   wherever a multi-agent batch list appears. Deliberately missing from the
   L-06 mockup (non-goals): an agent picker in the header, the "30 days"
   filter. The Compare button itself only opens `CompareModal` from Крок 18 —
   this step wires its enabled/disabled state. */
"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useAgent } from "@/lib/hooks/agents";
import { useAgentEvalBatches } from "@/lib/hooks/evals";
import { formatMetric } from "@/components/eval-metric/format";
import { MetricTrend } from "./MetricTrend";
import { RunsTable } from "./RunsTable";
import { CompareModal } from "../CompareModal";
import { byRecency, canCompare, formatDelta, latestDelta } from "./helpers";
import { s } from "./styles";

export function AgentEvalView() {
  const t = useTranslations("eval");
  const params = useParams<{ agentId: string }>();
  const { agentId } = params;

  const { data: agent } = useAgent(agentId);
  const { data: batches, isLoading, isError, refetch } = useAgentEvalBatches(agentId);
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [compareOpen, setCompareOpen] = React.useState(false);

  const toggle = (batchId: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(batchId)) return prev.filter((id) => id !== batchId);
      if (prev.length >= 2) return prev;
      return [...prev, batchId];
    });
  };

  const rows = batches ?? [];
  const selectedBatches = rows.filter((b) => selectedIds.includes(b.id));
  const compareEnabled = canCompare(selectedBatches);
  const latest = rows.length > 0 ? byRecency(rows)[0]! : null;
  const delta = rows.length > 0 ? latestDelta(rows) : null;

  const crumb = [
    { label: t("page.crumbSkillsLab") },
    { label: t("page.crumbEvalDashboard"), href: "/evals" },
    { label: agent?.name ?? agentId },
  ];

  return (
    <AppShell crumb={crumb}>
      <div style={s.wrap}>
        <div style={s.headerRow}>
          <h1 style={s.h1}>{agent?.name ?? t("dashboard.defaultTitle")}</h1>
          <Button kind="primary" size="sm" disabled={!compareEnabled} onClick={() => setCompareOpen(true)}>
            {t("agentEval.compare")}
          </Button>
        </div>

        {isLoading && <Skeleton height={200} />}

        {isError && <ErrorState body={t("dashboard.loading")} onRetry={() => refetch()} />}

        {!isLoading && !isError && rows.length === 0 && (
          <EmptyState icon="Target" title={t("dashboard.noRuns")} body={t("dashboard.configure")} />
        )}

        {!isLoading && !isError && rows.length > 0 && (
          <>
            {latest && (
              <div style={s.deltaRow}>
                <span>
                  {t("dashboard.metrics.recall")} {formatMetric(latest.recall)}
                  {delta && ` ${formatDelta(delta.recall)}`}
                </span>
                <span>
                  {t("dashboard.metrics.precision")} {formatMetric(latest.precision)}
                  {delta && ` ${formatDelta(delta.precision)}`}
                </span>
                <span>
                  {t("dashboard.metrics.citationAccuracy")} {formatMetric(latest.citation_accuracy)}
                  {delta && ` ${formatDelta(delta.citation_accuracy)}`}
                </span>
              </div>
            )}

            <MetricTrend batches={rows} />

            <RunsTable batches={rows} selectedIds={selectedIds} onToggle={toggle} />
          </>
        )}

        {compareOpen && compareEnabled && selectedBatches[0] && selectedBatches[1] && (
          <CompareModal
            batchIdA={selectedBatches[0].id}
            batchIdB={selectedBatches[1].id}
            onClose={() => setCompareOpen(false)}
          />
        )}
      </div>
    </AppShell>
  );
}
