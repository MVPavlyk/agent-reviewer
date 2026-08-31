import type { CSSProperties } from "react";

export const s = {
  wrap: {
    maxWidth: 1100,
    margin: "0 auto",
    padding: "28px 24px 60px",
    display: "flex",
    flexDirection: "column",
    gap: 16,
  } satisfies CSSProperties,
  h1: { fontSize: 20, fontWeight: 700 } satisfies CSSProperties,
  subtitle: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  loadingList: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,

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
  inactiveLink: { color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
