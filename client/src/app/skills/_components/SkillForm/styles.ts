import type { CSSProperties } from "react";

export const s = {
  body: { display: "flex", flexDirection: "column" } satisfies CSSProperties,
} as const;
