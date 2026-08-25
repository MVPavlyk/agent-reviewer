/* ConfigureRun — Multi-Agent Review, step 1 (pick a PR) + step 2 (pick
   agents), a live pre-run estimate, and the Run button. `?prId=` is the URL
   source of truth for the chosen PR (survives refresh/share). */
"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, SelectInput, EmptyState } from "@devdigest/ui";
import { AgentPicker } from "@/components/agent-picker";
import { useRepos, usePulls, useAgentEstimates, useRunMultiAgent } from "@/lib/hooks";
import { formatCost } from "@/components/run-cost-badge/format";
import { ApiError } from "@/lib/api";
import { estimateForSelection } from "./helpers";
import { s } from "./styles";

export function ConfigureRun() {
  const t = useTranslations("multiAgent");
  const router = useRouter();
  const search = useSearchParams();
  const prId = search.get("prId");

  const [repoId, setRepoId] = React.useState<string>("");
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);

  const { data: repos } = useRepos();
  const { data: pulls } = usePulls(repoId || null);
  const { data: estimates } = useAgentEstimates(selectedIds);
  const run = useRunMultiAgent();

  const setPrId = (id: string | null) => {
    const sp = new URLSearchParams(search.toString());
    if (id) sp.set("prId", id);
    else sp.delete("prId");
    router.replace(`/multi-agent/configure${sp.toString() ? `?${sp.toString()}` : ""}`);
  };

  const estimate = estimateForSelection(estimates?.per_agent, selectedIds);
  const canRun = !!prId && selectedIds.length > 0;

  const handleRun = async () => {
    if (!prId) return;
    try {
      const res = await run.mutateAsync({ prId, agentIds: selectedIds });
      router.push(`/multi-agent/${res.id}?prId=${prId}`);
    } catch {
      // Error stays on-page via `run.isError` (EC-7) — no navigation.
    }
  };

  return (
    <div style={s.page}>
      <div style={s.title}>{t("configure.title")}</div>

      <div style={s.step}>
        <div style={s.stepLabel}>{t("configure.step1Label")}</div>
        <SelectInput
          value={repoId}
          onChange={(v) => {
            setRepoId(v);
            setPrId(null);
          }}
          options={[{ value: "", label: t("configure.step1Placeholder") }, ...(repos ?? []).map((r) => ({
            value: r.id,
            label: r.full_name,
          }))]}
        />
        {repoId && (
          <SelectInput
            value={prId ?? ""}
            onChange={(v) => setPrId(v || null)}
            options={[
              { value: "", label: t("configure.step1Placeholder") },
              ...(pulls ?? []).map((p) => ({ value: p.id ?? "", label: `#${p.number} ${p.title}` })),
            ]}
          />
        )}
      </div>

      <div style={s.step}>
        <div style={s.stepLabel}>{t("configure.title")} — agents</div>
        {!prId ? (
          <EmptyState
            icon="Users"
            title={t("configure.step2EmptyTitle")}
            body={t("configure.step2EmptyBody")}
          />
        ) : (
          <AgentPicker selectedIds={selectedIds} onChange={setSelectedIds} />
        )}
      </div>

      <div style={s.footer}>
        {prId && selectedIds.length > 0 && (
          <div style={s.estimateLine}>
            {t("configure.estimateLine", {
              seconds: estimate.maxTimeMs != null ? (estimate.maxTimeMs / 1000).toFixed(1) : "—",
              cost: formatCost(estimate.sumCostUsd),
            })}
            {estimate.partial && <span style={s.estimatePartial}> ({t("configure.estimatePartial")})</span>}
          </div>
        )}
        {run.isError && (
          <div style={s.errorBox} role="alert">
            <strong>{t("configure.errorTitle")}</strong>
            <div>
              {run.error instanceof ApiError ? run.error.message : t("configure.errorBody")}
            </div>
          </div>
        )}
        <Button kind="primary" disabled={!canRun || run.isPending} loading={run.isPending} onClick={handleRun}>
          {t("configure.runButton", { count: selectedIds.length })}
        </Button>
      </div>
    </div>
  );
}
