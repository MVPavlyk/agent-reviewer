"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { SeverityBadge, ConfidenceNum } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";

/** Last path segment — the popover is narrow and a finding's `file` can be an
 *  arbitrarily deep repo path, so show just the filename (full path is still
 *  available via the `title` tooltip). */
function basename(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? path : path.slice(idx + 1);
}

/** Popover body for a Timeline run's severity badges — a preview list of that
 *  run's findings. Clicking one navigates to the findings tab, pre-filtered to
 *  its severity and scrolled to it (via `findingItem`, handled in FindingsTab). */
export function FindingsPreviewList({
  findings,
  repoId,
  prNumber,
}: {
  findings: FindingRecord[];
  repoId: string;
  prNumber: number;
}) {
  const router = useRouter();
  const t = useTranslations("prReview");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          color: "var(--text-muted)",
          padding: "4px 8px 6px",
        }}
      >
        {t("timeline.findingsPopoverTitle", { count: findings.length })}
      </div>
      {findings.map((f) => (
        <button
          key={f.id}
          type="button"
          onClick={(e) => {
            // Some triggers (e.g. the PR-list row) are themselves clickable —
            // don't let this bubble into a competing navigation.
            e.stopPropagation();
            router.push(
              `/repos/${repoId}/pulls/${prNumber}?tab=findings&sev=${f.severity}&findingItem=${f.id}`,
            );
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--bg-hover)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
          }}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            width: "100%",
            textAlign: "left",
            padding: "8px",
            borderRadius: 6,
            border: "none",
            background: "transparent",
            cursor: "pointer",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <SeverityBadge severity={f.severity} compact />
            <span
              style={{
                fontSize: 12.5,
                fontWeight: 600,
                color: "var(--text-primary)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {f.title}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "var(--text-muted)" }}>
            <span
              className="mono"
              title={`${f.file}:${f.start_line}`}
              style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}
            >
              {basename(f.file)}:{f.start_line}
            </span>
            <span style={{ flexShrink: 0 }}>
              <ConfidenceNum value={f.confidence} />
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}
