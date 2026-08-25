import type { CSSProperties } from "react";

export const s = {
  page: { display: "flex", flexDirection: "column", gap: 20, paddingBottom: 32 } satisfies CSSProperties,
  modeRow: { display: "flex", justifyContent: "center", padding: "0 32px" } satisfies CSSProperties,
} as const;
