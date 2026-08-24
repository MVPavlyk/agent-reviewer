import type { CSSProperties } from "react";

export const s = {
  body: { padding: "18px 24px", display: "flex", flexDirection: "column", gap: 20 } satisfies CSSProperties,

  sectionLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    marginBottom: 6,
  } satisfies CSSProperties,

  metricsRow: { display: "flex", flexDirection: "column", gap: 4 } satisfies CSSProperties,
  metricLine: {
    display: "grid",
    gridTemplateColumns: "1fr auto auto",
    alignItems: "baseline",
    gap: 12,
    fontSize: 12.5,
  } satisfies CSSProperties,
  metricLabel: { color: "var(--text-secondary)", fontWeight: 600 } satisfies CSSProperties,
  metricDelta: { minWidth: 48, textAlign: "right" } satisfies CSSProperties,

  summaryLine: { fontSize: 13, fontWeight: 600 } satisfies CSSProperties,

  table: { width: "100%", borderCollapse: "collapse" } satisfies CSSProperties,
  th: {
    textAlign: "left",
    fontSize: 10.5,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.03em",
    color: "var(--text-muted)",
    padding: "6px 10px",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  td: { padding: "8px 10px", fontSize: 12.5, borderBottom: "1px solid var(--border)" } satisfies CSSProperties,

  diffBlock: {
    margin: 0,
    padding: 12,
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    fontSize: 12,
    lineHeight: 1.55,
    overflow: "auto",
    maxHeight: 320,
  } satisfies CSSProperties,

  diffLine: (kind: "added" | "removed" | "same"): CSSProperties => ({
    whiteSpace: "pre-wrap",
    padding: "0 6px",
    background: kind === "added" ? "var(--diff-add-bg, rgba(46,160,67,0.15))" : kind === "removed" ? "var(--diff-del-bg, rgba(248,81,73,0.15))" : "transparent",
    color: kind === "added" ? "var(--ok, #2ea043)" : kind === "removed" ? "var(--danger, #f85149)" : "inherit",
  }),
} as const;
