import type { CSSProperties } from "react";

export const s = {
  wrap: {
    maxWidth: 880,
    margin: "0 auto",
    padding: "28px 24px 60px",
    display: "flex",
    flexDirection: "column",
    gap: 18,
  } satisfies CSSProperties,
  headerRow: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
  } satisfies CSSProperties,
  h1: { fontSize: 20, fontWeight: 700 } satisfies CSSProperties,
  subtitle: { fontSize: 13, color: "var(--text-secondary)", marginTop: 4 } satisfies CSSProperties,
  bulkBar: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  bulkCount: { fontSize: 12.5, color: "var(--text-muted)", flex: 1 } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 14 } satisfies CSSProperties,
} as const;
