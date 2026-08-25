import type { CSSProperties } from "react";

export const s = {
  root: {
    display: "inline-flex",
    padding: 2,
    borderRadius: 8,
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
  } satisfies CSSProperties,
  option: (active: boolean): CSSProperties => ({
    padding: "6px 14px",
    fontSize: 13,
    fontWeight: 600,
    borderRadius: 6,
    border: "none",
    cursor: "pointer",
    background: active ? "var(--accent)" : "transparent",
    color: active ? "#fff" : "var(--text-secondary)",
  }),
} as const;
