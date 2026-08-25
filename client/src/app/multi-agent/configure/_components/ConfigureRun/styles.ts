import type { CSSProperties } from "react";

export const s = {
  page: {
    padding: "28px 32px",
    maxWidth: 760,
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    gap: 24,
  } satisfies CSSProperties,
  title: { fontSize: 20, fontWeight: 700, color: "var(--text-primary)" } satisfies CSSProperties,
  step: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  stepLabel: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  footer: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    alignItems: "flex-start",
    paddingTop: 8,
    borderTop: "1px solid var(--border)",
  } satisfies CSSProperties,
  estimateLine: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  estimatePartial: { color: "var(--text-muted)", fontStyle: "italic" } satisfies CSSProperties,
  errorBox: {
    padding: "10px 14px",
    borderRadius: 7,
    border: "1px solid var(--crit)",
    background: "var(--crit-bg)",
    color: "var(--crit)",
    fontSize: 13,
  } satisfies CSSProperties,
} as const;
