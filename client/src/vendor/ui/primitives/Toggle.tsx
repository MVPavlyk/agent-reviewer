import React from "react";

export function Toggle({
  on,
  onChange,
  size = 18,
  label,
  disabled,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  size?: number;
  /** Accessible name — required for a switch with no visible adjacent label
   *  (e.g. one of many in a grid of cards), otherwise screen readers and RTL
   *  queries have nothing to distinguish it by. */
  label?: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={() => !disabled && onChange(!on)}
      disabled={disabled}
      role="switch"
      aria-checked={on}
      aria-label={label}
      style={{
        width: size * 1.85,
        height: size + 4,
        borderRadius: 99,
        border: "none",
        padding: 2,
        background: on ? "var(--accent)" : "var(--border-strong)",
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "background .15s",
        position: "relative",
      }}
    >
      <span
        style={{
          display: "block",
          width: size,
          height: size,
          borderRadius: 99,
          background: "#fff",
          transform: on ? `translateX(${size * 0.85}px)` : "none",
          transition: "transform .15s",
          boxShadow: "0 1px 3px rgba(0,0,0,.3)",
        }}
      />
    </button>
  );
}
