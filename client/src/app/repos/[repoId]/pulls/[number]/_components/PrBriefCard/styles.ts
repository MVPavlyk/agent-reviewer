import type { CSSProperties } from "react";

export const s = {
  wrap: { marginBottom: 20 } satisfies CSSProperties,
  section: { marginBottom: 14 } satisfies CSSProperties,
  sectionLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    marginBottom: 6,
  } satisfies CSSProperties,
  // NFR-2/EC-8: model-authored explanation text can be arbitrarily long or
  // contain no spaces (e.g. a URL) — never let it push the card wider than
  // its container.
  explanation: {
    fontSize: 13,
    color: "var(--text-secondary)",
    lineHeight: 1.55,
    overflowWrap: "anywhere",
  } satisfies CSSProperties,
  bodyText: {
    fontSize: 14,
    color: "var(--text-primary)",
    lineHeight: 1.55,
    overflowWrap: "anywhere",
  } satisfies CSSProperties,
  emptyNote: {
    fontSize: 13,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  riskList: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,
  riskItem: {
    borderLeftStyle: "solid",
    borderLeftWidth: 3,
    borderLeftColor: "var(--border)",
    paddingLeft: 10,
  } satisfies CSSProperties,
  riskHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  } satisfies CSSProperties,
  riskTitle: {
    fontSize: 13.5,
    fontWeight: 600,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  fileRefs: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 6,
  } satisfies CSSProperties,
  fileRefLink: {
    color: "inherit",
    textDecoration: "none",
  } satisfies CSSProperties,
  focusList: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  } satisfies CSSProperties,
  focusItem: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    fontSize: 13,
  } satisfies CSSProperties,
  focusLink: {
    color: "var(--accent)",
    textDecoration: "none",
    fontFamily: "var(--font-mono, monospace)",
    fontSize: 12.5,
  } satisfies CSSProperties,
  focusReason: {
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  staleNotice: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12.5,
    color: "var(--warn)",
    marginBottom: 10,
  } satisfies CSSProperties,
  footer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderTop: "1px solid var(--border)",
    paddingTop: 10,
    marginTop: 4,
  } satisfies CSSProperties,
  generatedBy: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    fontSize: 11.5,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  errorBox: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 8,
    fontSize: 13,
    color: "var(--crit)",
    background: "var(--crit-bg)",
    border: "1px solid var(--crit)",
    borderRadius: 6,
    padding: "10px 12px",
  } satisfies CSSProperties,
} as const;
