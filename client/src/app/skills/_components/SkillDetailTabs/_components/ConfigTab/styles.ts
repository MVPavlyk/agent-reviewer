import type { CSSProperties } from "react";

/** Co-located styles for ConfigTab — carried over from the former SkillPreviewPane. */
export const s = {
  wrap: { padding: 28, maxWidth: 760 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 12 } satisfies CSSProperties,
  headerText: { flex: 1 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  description: { fontSize: 13, color: "var(--text-secondary)", marginTop: 4 } satisfies CSSProperties,
  metaRow: { display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" } satisfies CSSProperties,
  untrustedNotice: {
    fontSize: 12.5,
    lineHeight: 1.5,
    color: "var(--warn)",
    background: "var(--warn-bg)",
    border: "1px solid var(--warn)",
    borderRadius: 7,
    padding: "10px 12px",
    marginBottom: 16,
  } satisfies CSSProperties,
  bodySection: { marginBottom: 16 } satisfies CSSProperties,
  bodyLabel: { fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 } satisfies CSSProperties,
  bodyHint: { fontSize: 12, color: "var(--text-muted)", marginBottom: 8 } satisfies CSSProperties,
  bodyError: {
    fontSize: 12,
    fontWeight: 500,
    color: "var(--crit)",
    marginTop: 8,
    lineHeight: 1.45,
  } satisfies CSSProperties,
  footer: { display: "flex", justifyContent: "flex-end" } satisfies CSSProperties,
} as const;
