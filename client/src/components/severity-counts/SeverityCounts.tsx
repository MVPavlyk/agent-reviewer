"use client";

import type { CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { SeverityBadge, Icon } from "@devdigest/ui";
import type { SeverityCounts as SeverityCountsShape } from "@/vendor/shared";
import { SEVERITY_LEVELS, countFor, type SeverityLevel } from "./helpers";

export type SeverityCountsProps = {
  counts: SeverityCountsShape | null | undefined;
  variant?: "compact" | "detailed";
  /** Currently-selected level (detailed variant only) — highlights that pill. */
  selected?: SeverityLevel | null;
  /** Fires with the clicked level. Detailed: toggles — clicking the
   *  already-selected level fires `null` (clear). Compact: each pill is its
   *  own button and always fires its own level (no toggle/selected state —
   *  compact is typically a jump-elsewhere action, e.g. navigating to a PR
   *  pre-filtered to that severity). Omit to render compact as plain badges. */
  onSelect?: (level: SeverityLevel | null) => void;
  style?: CSSProperties;
};

/** Findings-by-severity counters. `compact` is the PR-list column (icon+count
 *  per non-zero level, "—" when everything is zero). `detailed` is the PR-detail
 *  clickable row (all three levels always shown, zero levels dimmed). */
export function SeverityCounts({
  counts,
  variant = "compact",
  selected = null,
  onSelect,
  style,
}: SeverityCountsProps) {
  const t = useTranslations("common");
  const nonZero = SEVERITY_LEVELS.filter((lvl) => countFor(counts, lvl) > 0);

  if (variant === "compact") {
    if (nonZero.length === 0) {
      return (
        <span style={{ color: "var(--text-muted)", ...style }}>—</span>
      );
    }
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, ...style }}>
        {nonZero.map((lvl) =>
          onSelect ? (
            <button
              key={lvl}
              type="button"
              onClick={(e) => {
                // Compact badges commonly sit inside a clickable row (PR-list)
                // or a hover popover trigger — don't let this bubble into
                // either and fire an unrelated navigation alongside ours.
                e.stopPropagation();
                onSelect(lvl);
              }}
              title={t("severityCounts.showOnly", { level: lvl })}
              style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "inline-flex" }}
            >
              <SeverityBadge severity={lvl} count={countFor(counts, lvl)} compact />
            </button>
          ) : (
            <SeverityBadge key={lvl} severity={lvl} count={countFor(counts, lvl)} compact />
          ),
        )}
      </span>
    );
  }

  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8, ...style }}>
      {SEVERITY_LEVELS.map((lvl) => {
        const n = countFor(counts, lvl);
        const isSelected = selected === lvl;
        const disabled = n === 0;
        return (
          <button
            key={lvl}
            type="button"
            disabled={disabled}
            onClick={() => onSelect?.(isSelected ? null : lvl)}
            aria-pressed={isSelected}
            title={
              isSelected
                ? t("severityCounts.clearFilter")
                : t("severityCounts.showOnly", { level: lvl })
            }
            style={{
              display: "inline-flex",
              alignItems: "center",
              background: "transparent",
              border: "none",
              padding: 0,
              cursor: disabled ? "default" : "pointer",
              opacity: disabled ? 0.4 : 1,
              outline: isSelected ? "1px solid var(--border-strong, currentColor)" : "none",
              outlineOffset: 2,
              borderRadius: 5,
            }}
          >
            <SeverityBadge severity={lvl} count={n} />
          </button>
        );
      })}
      {selected && (
        <button
          type="button"
          onClick={() => onSelect?.(null)}
          title={t("severityCounts.clearFilter")}
          style={{
            display: "inline-flex",
            alignItems: "center",
            background: "transparent",
            border: "none",
            padding: 2,
            cursor: "pointer",
            color: "var(--text-muted)",
          }}
        >
          <Icon.X size={14} />
        </button>
      )}
    </div>
  );
}
