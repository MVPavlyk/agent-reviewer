import type { CSSProperties } from "react";
import type { DiffLine } from "./diff";

const DIFF_LINE_COLOR: Record<DiffLine["type"], string | undefined> = {
  add: "var(--ok)",
  remove: "var(--crit)",
  same: undefined,
};
const DIFF_LINE_BG: Record<DiffLine["type"], string | undefined> = {
  add: "var(--ok-bg)",
  remove: "var(--crit-bg)",
  same: undefined,
};

export const s = {
  wrap: { padding: 28, maxWidth: 760, display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  row: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: 12,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  } satisfies CSSProperties,
  rowHeader: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } satisfies CSSProperties,
  summary: { fontSize: 13, color: "var(--text-secondary)", flex: 1 } satisfies CSSProperties,
  date: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  rowActions: { display: "flex", gap: 8 } satisfies CSSProperties,
  diff: {
    margin: 0,
    fontSize: 12,
    lineHeight: 1.5,
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    borderRadius: 6,
    padding: "8px 10px",
    overflow: "auto",
    maxHeight: 300,
    fontFamily: "var(--font-mono)",
    whiteSpace: "pre-wrap",
  } satisfies CSSProperties,
  diffLine: (type: DiffLine["type"]): CSSProperties => ({
    color: DIFF_LINE_COLOR[type],
    background: DIFF_LINE_BG[type],
  }),
} as const;
