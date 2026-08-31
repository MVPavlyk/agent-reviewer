import type { CSSProperties } from "react";

export const s = {
  wrap: { padding: 24, maxWidth: 820, display: "flex", flexDirection: "column", gap: 20 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", justifyContent: "space-between" } satisfies CSSProperties,
  headerLeft: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  title: { fontSize: 16, fontWeight: 700 } satisfies CSSProperties,

  section: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  sectionLabel: {
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  chipRow: { display: "flex", gap: 8 } satisfies CSSProperties,

  installList: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  installCard: {
    border: "1px solid var(--border)",
    borderRadius: 9,
    background: "var(--bg-elevated)",
    padding: "12px 14px",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  } satisfies CSSProperties,
  installRow: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" } satisfies CSSProperties,
  repoName: { fontFamily: "var(--font-mono, monospace)", fontSize: 13, fontWeight: 600 } satisfies CSSProperties,
  meta: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,

  historyLabel: { fontSize: 10.5, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.03em" } satisfies CSSProperties,
  historyList: { display: "flex", flexDirection: "column", gap: 4 } satisfies CSSProperties,
  historyRow: { display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--text-secondary)" } satisfies CSSProperties,
  historyEmpty: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,

  footerAdd: { display: "flex", justifyContent: "flex-start" } satisfies CSSProperties,
} as const;
