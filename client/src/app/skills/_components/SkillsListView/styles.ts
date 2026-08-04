import type { CSSProperties } from "react";
import { LIST_COL_WIDTH } from "./constants";

export const s = {
  wrap: { display: "flex", height: "calc(100vh - 52px)" } satisfies CSSProperties,
  listCol: {
    width: LIST_COL_WIDTH,
    flexShrink: 0,
    borderRight: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  listColHead: { padding: "16px 16px 12px" } satisfies CSSProperties,
  headerRow: { display: "flex", alignItems: "center", gap: 10, marginBottom: 14 } satisfies CSSProperties,
  h1: { fontSize: 18, fontWeight: 700, flex: 1 } satisfies CSSProperties,
  search: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 12px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  searchIcon: { color: "var(--text-muted)" } satisfies CSSProperties,
  searchInput: {
    flex: 1,
    fontSize: 13,
    background: "transparent",
    border: "none",
    outline: "none",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  listBody: { flex: 1, overflow: "auto", padding: "0 12px 12px" } satisfies CSSProperties,
  previewCol: { flex: 1, minWidth: 0, overflow: "auto" } satisfies CSSProperties,
  selectPrompt: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    textAlign: "center",
    padding: 28,
  } satisfies CSSProperties,
  selectPromptTitle: { fontSize: 15, fontWeight: 600, marginBottom: 6 } satisfies CSSProperties,
  selectPromptBody: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
