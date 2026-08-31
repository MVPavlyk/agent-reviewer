import type { CSSProperties } from "react";

export const s = {
  root: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    padding: "24px 32px 16px",
  } satisfies CSSProperties,
  topRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  } satisfies CSSProperties,
  subtitle: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  title: {
    fontSize: 20,
    fontWeight: 700,
    color: "var(--text-primary)",
    display: "flex",
    alignItems: "center",
    gap: 10,
  } satisfies CSSProperties,
  prNumber: { color: "var(--text-muted)", fontWeight: 500 } satisfies CSSProperties,
  meta: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
} as const;
