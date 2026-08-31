import type { CSSProperties } from "react";

export const s = {
  root: { display: "flex", flexDirection: "column", gap: 0, padding: "0 32px" } satisfies CSSProperties,
  tabBar: { display: "flex", gap: 4, borderBottom: "1px solid var(--border)" } satisfies CSSProperties,
  tab: (active: boolean, accent: string): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 14px",
    border: "none",
    background: "transparent",
    borderBottom: "2px solid " + (active ? accent : "transparent"),
    cursor: "pointer",
    fontSize: 13,
    fontWeight: active ? 700 : 500,
    color: active ? "var(--text-primary)" : "var(--text-secondary)",
  }),
  banner: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "16px 4px",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  bannerMain: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 } satisfies CSSProperties,
  bannerTitle: { fontSize: 14, fontWeight: 700, color: "var(--text-primary)" } satisfies CSSProperties,
  bannerSummary: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  bannerMeta: { display: "flex", alignItems: "center", gap: 12, fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 8, padding: "14px 0 20px" } satisfies CSSProperties,
} as const;
