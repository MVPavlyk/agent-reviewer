import type { CSSProperties } from "react";

export const s = {
  body: { padding: "20px 24px", display: "flex", flexDirection: "column", gap: 4 } satisfies CSSProperties,
  loading: { display: "flex", flexDirection: "column", gap: 12, padding: "4px 0 20px" } satisfies CSSProperties,
  loadingLabel: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  error: { fontSize: 13, color: "var(--crit)", padding: "20px 0" } satisfies CSSProperties,
  footer: { display: "flex", justifyContent: "flex-end", gap: 10 } satisfies CSSProperties,
  savedFooter: {
    fontSize: 12.5,
    color: "var(--ok)",
    display: "flex",
    alignItems: "center",
    gap: 6,
  } satisfies CSSProperties,
} as const;
