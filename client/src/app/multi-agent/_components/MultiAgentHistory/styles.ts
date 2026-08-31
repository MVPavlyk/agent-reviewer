import type { CSSProperties } from "react";

export const s = {
  page: {
    padding: "28px 32px",
    maxWidth: 900,
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    gap: 20,
  } satisfies CSSProperties,
  topRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  } satisfies CSSProperties,
  title: { fontSize: 20, fontWeight: 700, color: "var(--text-primary)" } satisfies CSSProperties,
  list: {
    display: "flex",
    flexDirection: "column",
    border: "1px solid var(--border)",
    borderRadius: 8,
    overflow: "hidden",
  } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    padding: "12px 16px",
    borderBottom: "1px solid var(--border)",
    color: "var(--text-primary)",
    textDecoration: "none",
  } satisfies CSSProperties,
  rowLeft: { display: "flex", flexDirection: "column", gap: 2, minWidth: 0 } satisfies CSSProperties,
  prLine: { display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 600 } satisfies CSSProperties,
  prNumber: { color: "var(--text-muted)", fontWeight: 500 } satisfies CSSProperties,
  ranAt: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  rowRight: {
    display: "flex",
    alignItems: "center",
    gap: 20,
    fontSize: 13,
    color: "var(--text-secondary)",
    flexShrink: 0,
  } satisfies CSSProperties,
} as const;
