import type { CSSProperties } from "react";

export const s = {
  wrap: { padding: 24, maxWidth: 760, display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 } satisfies CSSProperties,
  hint: { fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.5 } satisfies CSSProperties,
} as const;
