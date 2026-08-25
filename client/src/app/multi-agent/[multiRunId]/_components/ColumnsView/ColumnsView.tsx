/* ColumnsView — one column per agent (AC-17/18/19). Findings compact rows,
   footer `View trace` · `K findings`. A failed agent shows a failure state,
   never "0 findings" (AC-19/EC-5). */
"use client";

import { useTranslations } from "next-intl";
import { Icon, SeverityBadge, CircularScore, type Severity } from "@devdigest/ui";
import type { AgentColumn } from "@devdigest/shared";
import { agentAccentColor } from "@/components/agent-picker/agent-accent";
import { formatSeconds } from "@/components/agent-picker/format";
import { formatCost } from "@/components/run-cost-badge/format";
import { s } from "./styles";

export function ColumnsView({
  columns,
  onViewTrace,
}: {
  columns: AgentColumn[];
  /** Opens the shared RunTraceDrawer for this run — wired by WP3. */
  onViewTrace: (runId: string) => void;
}) {
  const t = useTranslations("multiAgent");

  return (
    <div style={s.root}>
      {columns.map((col) => {
        const accent = agentAccentColor(col.agent_id, col.agent_name);
        return (
          <div key={col.run_id} style={s.column(accent)}>
            <div style={s.header}>
              <Icon.Cpu size={14} style={{ color: accent }} />
              <span style={s.agentName}>{col.agent_name}</span>
              {col.status !== "failed" && col.score != null && <CircularScore score={col.score} size={28} stroke={3} />}
              <span style={s.timeCost}>
                {formatSeconds(col.duration_ms)} · {formatCost(col.cost_usd)}
              </span>
            </div>

            {col.status === "failed" ? (
              <div style={s.failed}>
                <Icon.AlertOctagon size={20} />
                <strong>{t("results.failedTitle")}</strong>
                <span style={{ color: "var(--text-muted)", fontSize: 12 }}>{t("results.failedBody")}</span>
              </div>
            ) : (
              <div style={s.rows}>
                {col.findings.map((f) => (
                  <div key={f.id} style={s.row}>
                    <SeverityBadge severity={f.severity as Severity} compact />
                    <span style={s.rowTitle}>{f.title}</span>
                    <span className="mono" style={s.rowLoc}>
                      {f.file.split("/").pop()}:{f.start_line}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div style={s.footer}>
              <button
                type="button"
                onClick={() => onViewTrace(col.run_id)}
                style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", fontSize: 12, padding: 0 }}
              >
                {t("results.viewTrace")}
              </button>
              {col.status !== "failed" && (
                <span>{t("results.findingsCount", { count: col.findings.length })}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
