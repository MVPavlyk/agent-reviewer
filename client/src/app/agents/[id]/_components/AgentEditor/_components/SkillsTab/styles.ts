import type { CSSProperties } from "react";

export const s = {
  wrap: { padding: 24, maxWidth: 720 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "baseline", gap: 10, marginBottom: 6 } satisfies CSSProperties,
  title: { fontSize: 16, fontWeight: 700 } satisfies CSSProperties,
  count: { fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
  hint: { fontSize: 12.5, color: "var(--text-muted)", marginBottom: 16, lineHeight: 1.5 } satisfies CSSProperties,
  sectionLabel: {
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: "var(--text-muted)",
    margin: "18px 0 8px",
  } satisfies CSSProperties,
  linkedList: { display: "flex", flexDirection: "column" } satisfies CSSProperties,
  filterInput: {
    width: "100%",
    fontSize: 13,
    padding: "8px 12px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    color: "var(--text-primary)",
    outline: "none",
    marginBottom: 10,
  } satisfies CSSProperties,
  attachList: { display: "flex", flexDirection: "column" } satisfies CSSProperties,
  rowActions: { display: "flex", alignItems: "center", gap: 4 } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)", padding: "8px 0" } satisfies CSSProperties,
} as const;
