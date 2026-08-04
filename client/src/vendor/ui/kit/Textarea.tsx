import React from "react";

/** REAL controlled textarea. */
export function Textarea({
  value,
  onChange,
  placeholder,
  rows = 5,
  mono,
  invalid,
}: {
  value: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  rows?: number;
  mono?: boolean;
  /** Red border — pair with `FormField`'s `error` slot for a field-level
   *  validation failure (e.g. from an API 422 response). */
  invalid?: boolean;
}) {
  return (
    <textarea
      className={mono ? "mono" : undefined}
      value={value}
      rows={rows}
      placeholder={placeholder}
      onChange={(e) => onChange?.(e.target.value)}
      aria-invalid={invalid || undefined}
      style={{
        width: "100%",
        resize: "vertical",
        padding: "10px 12px",
        borderRadius: 7,
        border: "1px solid " + (invalid ? "var(--crit)" : "var(--border-strong)"),
        background: "var(--bg-elevated)",
        color: "var(--text-primary)",
        fontSize: 14,
        lineHeight: 1.55,
        outline: "none",
      }}
    />
  );
}
