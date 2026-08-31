/* FindingDetailCard — one expandable finding in the Tabs detail view
   (AC-21/22/23/24). Accept/Dismiss are real (useFindingAction); Learn/Turn
   into eval case/Reply are stub buttons — no request, TODO for Memory/L06. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SeverityBadge, CategoryTag, ConfidenceNum, Button, Markdown, type Severity, type Category } from "@devdigest/ui";
import type { FindingRecord, FindingActionKind } from "@devdigest/shared";

export function FindingDetailCard({
  finding,
  onAction,
  pending,
}: {
  finding: FindingRecord;
  onAction: (action: FindingActionKind) => void;
  pending?: boolean;
}) {
  const t = useTranslations("multiAgent");
  const [expanded, setExpanded] = React.useState(false);
  const accepted = !!finding.accepted_at;
  const dismissed = !!finding.dismissed_at;

  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 8,
        background: "var(--bg-elevated)",
        opacity: accepted || dismissed ? 0.7 : 1,
      }}
    >
      <div
        onClick={() => setExpanded((e) => !e)}
        style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", cursor: "pointer" }}
      >
        <SeverityBadge severity={finding.severity as Severity} compact />
        <span
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 13.5,
            fontWeight: 600,
            textDecoration: dismissed ? "line-through" : "none",
          }}
        >
          {finding.title}
        </span>
        <CategoryTag category={finding.category as Category} />
        <span className="mono" style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {finding.file}:{finding.start_line}
        </span>
        <ConfidenceNum value={finding.confidence} />
        <Icon.ChevronDown size={14} style={{ transform: expanded ? "rotate(180deg)" : "none" }} />
      </div>

      {expanded && (
        <div style={{ padding: "0 14px 14px", borderTop: "1px solid var(--border)" }}>
          <div style={{ fontSize: 13, lineHeight: 1.6, color: "var(--text-secondary)", marginTop: 12 }}>
            <Markdown>{finding.rationale}</Markdown>
          </div>
          {finding.suggestion && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 6 }}>
                {t("results.suggestedFix")}
              </div>
              <Markdown>{finding.suggestion}</Markdown>
            </div>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <Button kind="secondary" size="sm" icon="Check" disabled={pending} active={accepted} onClick={() => onAction("accept")}>
              {t("results.accept")}
            </Button>
            <Button kind="ghost" size="sm" icon="X" disabled={pending} active={dismissed} onClick={() => onAction("dismiss")}>
              {t("results.dismiss")}
            </Button>
            {/* TODO(Memory): wire once the cross-session memory curator ships. */}
            <Button kind="ghost" size="sm" icon="Brain" onClick={() => {}}>
              {t("results.learn")}
            </Button>
            {/* TODO(L06 evals): wire once eval-case creation is exposed here. */}
            <Button kind="ghost" size="sm" icon="FlaskConical" onClick={() => {}}>
              {t("results.turnIntoEvalCase")}
            </Button>
            {/* TODO(reply): wire once inline reply-to-author ships for multi-agent. */}
            <Button kind="ghost" size="sm" icon="MessageSquare" onClick={() => {}}>
              {t("results.replyToAuthor")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
