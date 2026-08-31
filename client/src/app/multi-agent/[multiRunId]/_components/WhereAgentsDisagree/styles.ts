import type { CSSProperties } from "react";

export const s = {
  root: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
    padding: "20px 32px",
    borderTop: "1px solid var(--border)",
  } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  } satisfies CSSProperties,
  title: {
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  toggleRow: { display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  groups: { display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
  group: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: 14,
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  groupHeader: { display: "flex", alignItems: "center", gap: 10, marginBottom: 10 } satisfies CSSProperties,
  location: { fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
  label: { fontSize: 14, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 10,
  } satisfies CSSProperties,
  cell: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    padding: 10,
    borderRadius: 6,
    background: "var(--bg-hover)",
  } satisfies CSSProperties,
  agentName: { fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  rationale: { fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.4 } satisfies CSSProperties,
} as const;
