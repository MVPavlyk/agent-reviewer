import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "flex", flexDirection: "column" } satisfies CSSProperties,
  tab: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "6px 10px",
    borderRadius: "6px 6px 0 0",
    border: "1px solid var(--border)",
    borderBottom: "none",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  filename: { fontSize: 12.5, color: "var(--text-secondary)" } satisfies CSSProperties,
  tokens: { fontSize: 11.5, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
