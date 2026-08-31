/* MultiAgentResults — Multi-Agent Review results (SPEC-06 G-3/G-4). One
   fetch (`useMultiAgentRun`) feeds both Columns and Tabs — the mode toggle
   only changes which view renders over the same data (AC-14/EC-10).
   `onViewTrace` opens the shared RunTraceDrawer (promoted to
   `@/components/RunTraceDrawer` in WP3) for the given run_id — the same
   component/behaviour the PR page uses (AC-16/AC-16a). */
"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Skeleton, EmptyState } from "@devdigest/ui";
import { useMultiAgentRun, usePullDetail, useRunEvents, usePrReviews } from "@/lib/hooks";
import RunTraceDrawer from "@/components/RunTraceDrawer";
import { ResultsHeader } from "../ResultsHeader";
import { ModeToggle } from "../ModeToggle";
import { ColumnsView } from "../ColumnsView";
import { TabsView } from "../TabsView";
import { WhereAgentsDisagree } from "../WhereAgentsDisagree";
import { parseMode, resolveFindings } from "./helpers";
import { s } from "./styles";

export function MultiAgentResults({ multiRunId }: { multiRunId: string }) {
  const t = useTranslations("multiAgent");
  const router = useRouter();
  const search = useSearchParams();
  const prId = search.get("prId");
  const mode = parseMode(search.get("mode"));

  const { data: run, isLoading, isError } = useMultiAgentRun(prId, multiRunId);
  const { data: pr } = usePullDetail(prId);
  const { data: reviews } = usePrReviews(prId);

  const runningIds = (run?.columns ?? []).filter((c) => c.status === "running").map((c) => c.run_id);
  const { running } = useRunEvents(runningIds);

  const setMode = (m: string) => {
    const sp = new URLSearchParams(search.toString());
    sp.set("mode", m);
    router.replace(`/multi-agent/${multiRunId}?${sp.toString()}`);
  };

  // Opens the shared RunTraceDrawer (same component as the PR page) for a
  // run_id — Columns' footer and Tabs' banner both call this (AC-16/AC-16a).
  const [openRunId, setOpenRunId] = React.useState<string | null>(null);
  const onViewTrace = (runId: string) => setOpenRunId(runId);
  const openColumn = (run?.columns ?? []).find((c) => c.run_id === openRunId);
  const allFindings = React.useMemo(
    () => (reviews ?? []).flatMap((r) => r.findings),
    [reviews],
  );

  if (isLoading) {
    return (
      <div style={{ padding: "28px 32px", display: "flex", flexDirection: "column", gap: 16 }}>
        <Skeleton height={28} width={420} />
        <Skeleton height={200} />
      </div>
    );
  }

  if (isError || !run) {
    return (
      <EmptyState icon="Users" title={t("results.notFoundTitle")} body={t("results.notFoundBody")} />
    );
  }

  return (
    <div style={s.page}>
      <ResultsHeader run={run} prTitle={pr?.title} />
      <div style={s.modeRow}>
        <ModeToggle mode={mode} onChange={setMode} />
      </div>
      {mode === "columns" ? (
        <ColumnsView columns={run.columns} onViewTrace={onViewTrace} />
      ) : (
        prId && <TabsView columns={run.columns} prId={prId} onViewTrace={onViewTrace} />
      )}
      <WhereAgentsDisagree conflicts={run.conflicts} running={running || runningIds.length > 0} />

      {openColumn && (
        <RunTraceDrawer
          runId={openColumn.run_id}
          agentName={openColumn.agent_name}
          prNumber={pr?.number ?? null}
          findings={resolveFindings(
            openColumn.findings.map((f) => f.id),
            allFindings,
          )}
          running={openColumn.status === "running"}
          onClose={() => setOpenRunId(null)}
        />
      )}
    </div>
  );
}
