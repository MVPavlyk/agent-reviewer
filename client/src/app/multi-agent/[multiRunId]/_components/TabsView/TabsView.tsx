/* TabsView — one tab per agent + a detail banner + expandable finding cards
   (AC-20/21/22/23/24). Findings are joined against `usePrReviews(prId)` by
   id to get body/suggestion/confidence (AgentColumnFinding is a subset). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, CircularScore, Button } from "@devdigest/ui";
import type { AgentColumn, FindingRecord, FindingActionKind } from "@devdigest/shared";
import { useFindingAction, usePrReviews } from "@/lib/hooks";
import { agentAccentColor } from "@/components/agent-picker/agent-accent";
import { formatSeconds } from "@/components/agent-picker/format";
import { formatCost } from "@/components/run-cost-badge/format";
import { FindingDetailCard } from "./FindingDetailCard";
import { resolveFindings } from "./helpers";
import { s } from "./styles";

export function TabsView({
  columns,
  prId,
  onViewTrace,
}: {
  columns: AgentColumn[];
  prId: string;
  onViewTrace: (runId: string) => void;
}) {
  const t = useTranslations("multiAgent");
  const { data: allFindings } = usePrReviews(prId);
  const findings: FindingRecord[] = React.useMemo(
    () => (allFindings ?? []).flatMap((r) => r.findings),
    [allFindings],
  );
  const [activeId, setActiveId] = React.useState<string>(columns[0]?.agent_id ?? "");
  const active = columns.find((c) => c.agent_id === activeId) ?? columns[0];
  const action = useFindingAction();

  const handleAction = (findingId: string, kind: FindingActionKind) => {
    action.mutate({ findingId, action: kind, prId });
  };

  if (!active) return null;
  const detail = resolveFindings(
    active.findings.map((f) => f.id),
    findings,
  );

  return (
    <div style={s.root}>
      <div style={s.tabBar} role="tablist">
        {columns.map((col) => {
          const isActive = col.agent_id === active.agent_id;
          return (
            <button
              key={col.agent_id}
              role="tab"
              aria-selected={isActive}
              type="button"
              onClick={() => setActiveId(col.agent_id)}
              style={s.tab(isActive, agentAccentColor(col.agent_id, col.agent_name))}
            >
              <Icon.Cpu size={13} />
              {col.agent_name}
              {col.score != null && <span className="tnum">{col.score}</span>}
            </button>
          );
        })}
      </div>

      <div style={s.banner}>
        {active.score != null && <CircularScore score={active.score} size={40} stroke={4} />}
        <div style={s.bannerMain}>
          <div style={s.bannerTitle}>{active.agent_name}</div>
          {active.summary && <div style={s.bannerSummary}>{active.summary}</div>}
        </div>
        <div style={s.bannerMeta}>
          <Button kind="ghost" size="sm" onClick={() => onViewTrace(active.run_id)}>
            {t("results.viewTrace")}
          </Button>
          <span>
            {formatSeconds(active.duration_ms)} · {formatCost(active.cost_usd)}
          </span>
        </div>
      </div>

      <div style={s.list}>
        {active.status === "failed" ? (
          <div style={{ color: "var(--crit)", fontSize: 13, padding: "16px 0" }}>
            {t("results.failedTitle")} — {t("results.failedBody")}
          </div>
        ) : (
          detail.map((f) => (
            <FindingDetailCard
              key={f.id}
              finding={f}
              pending={action.isPending}
              onAction={(kind) => handleAction(f.id, kind)}
            />
          ))
        )}
      </div>
    </div>
  );
}
