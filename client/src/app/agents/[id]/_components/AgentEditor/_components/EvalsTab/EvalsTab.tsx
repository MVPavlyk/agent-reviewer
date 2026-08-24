/* EvalsTab — the agent's regression gate (SPEC-05). Exactly one tab: no
   Stats/CI here (Non-goals). Metrics always come from the latest batch's own
   pre-computed aggregates (AC-44) — this component never recomputes
   recall/precision/citation from per-case rows. While a batch is running,
   `useEvalBatch` polls every `POLL_INTERVAL_MS` (the interval lives here,
   not in the hook — client/INSIGHTS.md 2026-08-11). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Button, EmptyState } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { useAgentEvalCases, useAgentEvalBatches, useEvalBatch, useRunAgentEvals } from "@/lib/hooks/evals";
import { formatCost } from "@/components/run-cost-badge/format";
import { formatMetric } from "@/components/eval-metric/format";
import { passLabel, formatDelta } from "@/components/eval-batch/format";
import { MetricTile } from "./MetricTile";
import { CaseRow } from "./CaseRow";
import { CaseModal } from "./CaseModal";
import { notRanCount, passingSummary, tabMetricDelta } from "./helpers";
import { POLL_INTERVAL_MS } from "./constants";
import { s } from "./styles";

export function EvalsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const qc = useQueryClient();
  const { data: cases } = useAgentEvalCases(agent.id);
  const { data: batches } = useAgentEvalBatches(agent.id);
  const runEvals = useRunAgentEvals(agent.id);
  const [openCaseId, setOpenCaseId] = React.useState<string | null>(null);
  const [isPolling, setIsPolling] = React.useState(false);

  const latestBatch = batches?.[0] ?? null;

  // Resume polling if the latest known batch is still running (e.g. after a
  // page reload mid-run) — not only right after this session's own click.
  React.useEffect(() => {
    if (latestBatch?.status === "running") setIsPolling(true);
  }, [latestBatch?.status]);

  const poll = useEvalBatch(latestBatch?.id, isPolling ? POLL_INTERVAL_MS : false);

  // Once the polled batch settles, stop polling and refresh the batch/case
  // lists so the passing badge and case statuses reflect the finished run.
  React.useEffect(() => {
    if (isPolling && poll.data && poll.data.batch.status !== "running") {
      setIsPolling(false);
      qc.invalidateQueries({ queryKey: ["agent-eval-batches", agent.id] });
      qc.invalidateQueries({ queryKey: ["agent-eval-cases", agent.id] });
    }
  }, [isPolling, poll.data, qc, agent.id]);

  function handleRunAll() {
    setIsPolling(true);
    runEvals.mutate({});
  }

  const batch = poll.data?.batch ?? latestBatch;
  // `isPolling` flips true synchronously on click, before the new batch's row
  // exists in `batches` — so the button disables immediately, not one refetch late.
  const running = isPolling || batch?.status === "running";
  const { passing, total } = passingSummary(cases, latestBatch);
  const delta = tabMetricDelta(batches);

  if (cases && cases.length === 0) {
    return (
      <div style={s.wrap}>
        <EmptyState icon="FlaskConical" title={t("editor.evals.empty.title")} body={t("editor.evals.empty.body")} />
        <div style={{ display: "flex", justifyContent: "center" }}>
          <Button kind="primary" icon="Play" disabled>
            {t("editor.evals.runAll")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <div style={s.headerLeft}>
          <h3 style={s.title}>{t("editor.evals.title")}</h3>
          <span style={s.passingBadge}>{t("editor.evals.passingBadge", { passing, total })}</span>
        </div>
        <Button kind="primary" icon="Play" onClick={handleRunAll} disabled={running}>
          {running ? t("editor.evals.running") : t("editor.evals.runAll")}
        </Button>
      </div>

      {batch?.status === "partial" && (
        <div style={s.statusRow}>
          <span style={s.partialBadge}>{t("editor.evals.partial")}</span>
          <span style={s.notRan}>{t("editor.evals.notRan", { count: notRanCount(batch, cases) })}</span>
        </div>
      )}

      {running && (
        <div style={s.progressWrap} aria-live="polite">
          {t("editor.evals.progress", {
            done: poll.data?.completed_cases ?? 0,
            total: batch?.traces_total ?? cases?.length ?? 0,
          })}
        </div>
      )}

      <div style={s.tiles}>
        <MetricTile
          label={t("editor.evals.metrics.recall")}
          value={formatMetric(batch?.recall ?? null)}
          delta={delta ? formatDelta(delta.recall) : undefined}
        />
        <MetricTile
          label={t("editor.evals.metrics.precision")}
          value={formatMetric(batch?.precision ?? null)}
          delta={delta ? formatDelta(delta.precision) : undefined}
        />
        <MetricTile
          label={t("editor.evals.metrics.citation")}
          value={formatMetric(batch?.citation_accuracy ?? null)}
          delta={delta ? formatDelta(delta.citation_accuracy) : undefined}
        />
        <MetricTile
          label={t("editor.evals.metrics.traces")}
          value={batch ? passLabel(batch) : "—"}
          delta={delta ? formatDelta(delta.traces_passed) : undefined}
        />
        <MetricTile label={t("editor.evals.metrics.cost")} value={formatCost(batch?.cost_usd ?? null)} />
      </div>

      <div style={s.sectionLabel}>{t("editor.evals.casesHeading")}</div>
      <div style={s.caseList}>
        {(cases ?? []).map((row) => (
          <CaseRow key={row.id} row={row} onOpen={setOpenCaseId} />
        ))}
      </div>

      {openCaseId &&
        (() => {
          const row = (cases ?? []).find((c) => c.id === openCaseId);
          return row ? <CaseModal row={row} onClose={() => setOpenCaseId(null)} /> : null;
        })()}
    </div>
  );
}
