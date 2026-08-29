import type { CSSProperties } from "react";

export const s = {
  wrap: { padding: 24, maxWidth: 820 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 } satisfies CSSProperties,
  headerLeft: { display: "flex", alignItems: "baseline", gap: 10 } satisfies CSSProperties,
  title: { fontSize: 16, fontWeight: 700 } satisfies CSSProperties,
  passingBadge: { fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
  progressWrap: { fontSize: 12.5, color: "var(--text-secondary)", marginTop: 4 } satisfies CSSProperties,

  tiles: { display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, margin: "16px 0 20px" } satisfies CSSProperties,
  tile: {
    border: "1px solid var(--border)",
    borderRadius: 9,
    background: "var(--bg-elevated)",
    padding: "12px 14px",
  } satisfies CSSProperties,
  tileLabel: {
    fontSize: 10.5,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: "var(--text-muted)",
    marginBottom: 4,
  } satisfies CSSProperties,
  tileValue: { fontSize: 20, fontWeight: 700, display: "flex", alignItems: "baseline", gap: 6 } satisfies CSSProperties,
  tileDelta: { fontSize: 12, fontWeight: 600, color: "var(--text-muted)" } satisfies CSSProperties,

  statusRow: { display: "flex", alignItems: "center", gap: 8, marginBottom: 14 } satisfies CSSProperties,
  partialBadge: {
    fontSize: 11.5,
    fontWeight: 700,
    color: "var(--warn, #b58a00)",
    background: "var(--warn-bg, rgba(181,138,0,0.12))",
    borderRadius: 5,
    padding: "2px 8px",
    textTransform: "uppercase",
    letterSpacing: "0.03em",
  } satisfies CSSProperties,
  notRan: { fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,

  sectionLabel: {
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: "var(--text-muted)",
    margin: "18px 0 8px",
  } satisfies CSSProperties,

  caseList: { display: "flex", flexDirection: "column", gap: 6 } satisfies CSSProperties,
  caseRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    textAlign: "left",
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    cursor: "pointer",
  } satisfies CSSProperties,
  caseIcon: (color: string) =>
    ({ fontSize: 14, width: 18, textAlign: "center", color, flexShrink: 0 }) satisfies CSSProperties,
  caseName: { fontSize: 13, fontFamily: "var(--font-mono, monospace)", flexShrink: 0 } satisfies CSSProperties,
  caseCaption: { fontSize: 12, color: "var(--text-muted)", flex: 1 } satisfies CSSProperties,
} as const;
