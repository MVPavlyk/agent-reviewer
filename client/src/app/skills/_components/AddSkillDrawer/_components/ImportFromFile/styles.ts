import type { CSSProperties } from "react";

export const s = {
  dropZone: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: "40px 20px",
    borderRadius: 10,
    border: "1.5px dashed var(--border-strong)",
    background: "var(--bg-elevated)",
    cursor: "pointer",
    textAlign: "center",
  } satisfies CSSProperties,
  dropIcon: { color: "var(--text-muted)" } satisfies CSSProperties,
  dropLabel: { fontSize: 14, fontWeight: 600 } satisfies CSSProperties,
  dropHint: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  dropError: { fontSize: 12.5, color: "var(--crit)", marginTop: 4 } satisfies CSSProperties,
} as const;
