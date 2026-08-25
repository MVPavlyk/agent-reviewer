/* WhereAgentsDisagree — cross-agent groups at one file:line (AC-25/26/27/28).
   Rendered in both Columns and Tabs modes. Conflict-ness is derived
   client-side from `takes` (see helpers.ts); the server sends every
   cross-agent group (conflicts + agreement), this only filters the view. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Toggle, SeverityBadge, EmptyState, type Severity } from "@devdigest/ui";
import type { Conflict } from "@devdigest/shared";
import { visibleGroups } from "./helpers";
import { s } from "./styles";

export function WhereAgentsDisagree({ conflicts, running }: { conflicts: Conflict[]; running: boolean }) {
  const t = useTranslations("multiAgent");
  const [onlyConflicts, setOnlyConflicts] = React.useState(false);
  const shown = React.useMemo(() => visibleGroups(conflicts, onlyConflicts), [conflicts, onlyConflicts]);

  return (
    <div style={s.root}>
      <div style={s.header}>
        <div style={s.title}>{t("results.disagree.title")}</div>
        <label style={s.toggleRow}>
          {t("results.disagree.showOnlyConflicts")}
          <Toggle
            on={onlyConflicts}
            onChange={setOnlyConflicts}
            size={14}
            label={t("results.disagree.showOnlyConflicts")}
          />
        </label>
      </div>

      {shown.length === 0 ? (
        <EmptyState
          icon="Users"
          title={running ? t("results.disagree.emptyRunning") : t("results.disagree.empty")}
        />
      ) : (
        <div style={s.groups}>
          {shown.map((group) => (
            <div key={`${group.file}:${group.line}`} style={s.group}>
              <div style={s.groupHeader}>
                <span className="mono" style={s.location}>
                  {group.file}:{group.line}
                </span>
                <span style={s.label}>{group.title}</span>
              </div>
              <div style={s.grid}>
                {group.takes.map((take) => (
                  <div key={take.agent_id} style={s.cell}>
                    <span style={s.agentName}>{take.persona}</span>
                    {take.verdict === "ignored" ? (
                      <span style={{ color: "var(--text-muted)", fontSize: 12, fontWeight: 600 }}>
                        {t("results.disagree.didNotFlag")}
                      </span>
                    ) : (
                      <SeverityBadge severity={take.verdict as Severity} compact />
                    )}
                    <span style={s.rationale}>{take.note}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
