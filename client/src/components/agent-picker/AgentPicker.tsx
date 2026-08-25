/* AgentPicker — shared multi-select agent list (checkbox, icon+accent, name,
   one-line blurb, right-aligned time·cost). Used by both Multi-Agent
   Review's Configure run (client/src/app/multi-agent) and the PR-page picker
   (WP3). Controlled: the caller owns `selectedIds`. */
"use client";

import { useTranslations } from "next-intl";
import { Checkbox, Icon, Button } from "@devdigest/ui";
import { useAgents, useAgentEstimates } from "@/lib/hooks";
import { agentAccentColor } from "./agent-accent";
import { formatSeconds } from "./format";
import { formatCost } from "@/components/run-cost-badge/format";
import { estimateFor, toggleId, selectAllIds } from "./helpers";
import { s } from "./styles";

export function AgentPicker({
  selectedIds,
  onChange,
}: {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const t = useTranslations("multiAgent");
  const { data: agents } = useAgents();
  const all = agents ?? [];
  const { data: estimates } = useAgentEstimates(all.map((a) => a.id));

  if (all.length === 0) {
    return <div style={s.blurb}>{t("picker.noAgents")}</div>;
  }

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <Button kind="ghost" size="sm" onClick={() => onChange(selectAllIds(all, selectedIds))}>
          {t("picker.selectAll")}
        </Button>
      </div>
      <div role="group" aria-label={t("picker.selectAll")} style={s.list}>
        {all.map((agent) => {
          const accent = agentAccentColor(agent.id, agent.name);
          const est = estimateFor(estimates?.per_agent, agent.id);
          const cell =
            est == null
              ? t("picker.noHistory")
              : `${formatSeconds(est.time_ms)} · ${formatCost(est.cost_usd)}`;
          const checked = selectedIds.includes(agent.id);
          return (
            <div key={agent.id} style={s.row(accent)}>
              <div style={s.rowLabel}>
                <Checkbox
                  checked={checked}
                  onChange={() => onChange(toggleId(selectedIds, agent.id))}
                  label={
                    <span style={s.rowLabel}>
                      <span style={s.iconWrap(accent)}>
                        <Icon.Cpu size={14} />
                      </span>
                      <span style={s.main}>
                        <span style={s.name}>{agent.name}</span>
                        <span style={s.blurb} title={agent.description}>
                          {agent.description}
                        </span>
                      </span>
                    </span>
                  }
                />
              </div>
              <span className="tnum" style={s.timeCost}>
                {cell}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
