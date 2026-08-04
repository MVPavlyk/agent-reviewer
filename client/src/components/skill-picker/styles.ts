import type { CSSProperties } from "react";

export const s = {
  row: (active: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "9px 12px",
    borderRadius: 7,
    border: "1px solid " + (active ? "var(--border-strong)" : "var(--border)"),
    background: active ? "var(--bg-hover)" : "var(--bg-elevated)",
    marginBottom: 6,
  }),
  name: {
    fontSize: 13,
    fontWeight: 600,
    flex: 1,
    minWidth: 0,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } satisfies CSSProperties,
  badges: { display: "flex", alignItems: "center", gap: 6, flexShrink: 0 } satisfies CSSProperties,
} as const;
