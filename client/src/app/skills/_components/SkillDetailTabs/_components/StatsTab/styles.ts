import type { CSSProperties } from "react";

export const s = {
  wrap: { padding: 28, maxWidth: 760, display: "flex", flexDirection: "column", gap: 20 } satisfies CSSProperties,
  tiles: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 } satisfies CSSProperties,
  tile: { display: "flex", flexDirection: "column", gap: 4 } satisfies CSSProperties,
  tileLabel: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  tileValue: { fontSize: 20, fontWeight: 700 } satisfies CSSProperties,
  sectionTitle: { fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  categoryList: { display: "flex", flexDirection: "column", gap: 6 } satisfies CSSProperties,
  categoryRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 13,
    padding: "6px 0",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  categoryName: { flex: 1, textTransform: "capitalize" } satisfies CSSProperties,
  categoryCount: { color: "var(--text-secondary)", minWidth: 28, textAlign: "right" } satisfies CSSProperties,
  categoryCost: { color: "var(--text-secondary)", minWidth: 64, textAlign: "right", fontFamily: "var(--font-mono)" } satisfies CSSProperties,
  caveat: {
    fontSize: 12,
    lineHeight: 1.5,
    color: "var(--text-muted)",
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    borderRadius: 7,
    padding: "10px 12px",
  } satisfies CSSProperties,
} as const;
