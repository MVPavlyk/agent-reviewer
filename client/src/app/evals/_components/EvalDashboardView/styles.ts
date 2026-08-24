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
  h1: { fontSize: 20, fontWeight: 700 } satisfies CSSProperties,
  h2: { fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-muted)" } satisfies CSSProperties,

  cards: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 } satisfies CSSProperties,
  card: (enabled: boolean): CSSProperties => ({
    padding: 14,
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    opacity: enabled ? 1 : 0.6,
    cursor: enabled ? "pointer" : "default",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  }),
  cardHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 } satisfies CSSProperties,
  cardName: { fontSize: 14, fontWeight: 600, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } satisfies CSSProperties,
  cardMeta: { fontSize: 12, color: "var(--text-muted)", display: "flex", gap: 8, alignItems: "center" } satisfies CSSProperties,
  disabledBadge: {
    fontSize: 10.5,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.03em",
    color: "var(--text-muted)",
    background: "var(--bg-hover)",
    borderRadius: 5,
    padding: "2px 7px",
  } satisfies CSSProperties,

  tiles: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 } satisfies CSSProperties,
  tile: { textAlign: "center" } satisfies CSSProperties,
  tileLabel: { fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.03em", color: "var(--text-muted)" } satisfies CSSProperties,
  tileValue: { fontSize: 15, fontWeight: 700 } satisfies CSSProperties,

  footerRow: { display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,

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
