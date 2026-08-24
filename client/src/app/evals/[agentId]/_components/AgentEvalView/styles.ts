import type { CSSProperties } from "react";

export const s = {
  wrap: {
    maxWidth: 960,
    margin: "0 auto",
    padding: "28px 24px 60px",
    display: "flex",
    flexDirection: "column",
    gap: 20,
  } satisfies CSSProperties,
  headerRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 } satisfies CSSProperties,
  h1: { fontSize: 20, fontWeight: 700 } satisfies CSSProperties,
  h2: { fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-muted)" } satisfies CSSProperties,

  deltaRow: { display: "flex", gap: 16, fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,

  trendBlock: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  legend: { display: "flex", gap: 14, fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  legendItem: { display: "inline-flex", alignItems: "center", gap: 6 } satisfies CSSProperties,
  legendDot: (color: string): CSSProperties => ({
    display: "inline-block",
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: color,
  }),

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
  td: { padding: "8px 10px", fontSize: 13, borderBottom: "1px solid var(--border)" } satisfies CSSProperties,
} as const;
