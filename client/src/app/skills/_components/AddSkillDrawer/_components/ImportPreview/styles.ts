import type { CSSProperties } from "react";

export const s = {
  trustNotice: {
    fontSize: 12.5,
    lineHeight: 1.5,
    color: "var(--warn)",
    background: "var(--warn-bg)",
    border: "1px solid var(--warn)",
    borderRadius: 7,
    padding: "10px 12px",
    marginBottom: 16,
  } satisfies CSSProperties,
  ignoredBox: {
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    padding: "10px 12px",
    marginTop: 8,
  } satisfies CSSProperties,
  ignoredTitle: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12.5,
    fontWeight: 600,
    color: "var(--text-secondary)",
    marginBottom: 6,
  } satisfies CSSProperties,
  ignoredRow: {
    display: "flex",
    alignItems: "baseline",
    gap: 8,
    fontSize: 12,
    padding: "3px 0",
  } satisfies CSSProperties,
  ignoredPath: { color: "var(--text-primary)", flexShrink: 0 } satisfies CSSProperties,
  ignoredReason: { color: "var(--text-muted)" } satisfies CSSProperties,
  warning: { fontSize: 12.5, color: "var(--warn)", marginTop: 8 } satisfies CSSProperties,
} as const;
