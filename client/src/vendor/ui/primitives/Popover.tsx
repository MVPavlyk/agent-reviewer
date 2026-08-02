"use client";

import React from "react";
import { createPortal } from "react-dom";

/** Hover-triggered floating panel, anchored to its trigger. Rendered through a
 *  portal into `document.body` with `position: fixed` (computed from the
 *  trigger's `getBoundingClientRect()` on open) — NOT a plain absolute child
 *  of the trigger, because callers can sit inside an `overflow: hidden`
 *  ancestor (e.g. the PR-list's rounded table card) that would otherwise clip
 *  it. A short close delay lets the pointer travel from the trigger to the
 *  panel without it disappearing; any scroll while open closes it rather than
 *  tracking a moving anchor. */
export function Popover({
  trigger,
  children,
  align = "start",
}: {
  trigger: React.ReactNode;
  children: React.ReactNode;
  /** Which edge the panel hugs under the trigger. */
  align?: "start" | "end";
}) {
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState<{ top: number; left?: number; right?: number } | null>(null);
  const triggerRef = React.useRef<HTMLSpanElement | null>(null);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    const r = triggerRef.current?.getBoundingClientRect();
    if (r) {
      setPos(
        align === "end"
          ? { top: r.bottom + 6, right: window.innerWidth - r.right }
          : { top: r.bottom + 6, left: r.left },
      );
    }
    setOpen(true);
  };
  const scheduleHide = () => {
    closeTimer.current = setTimeout(() => setOpen(false), 150);
  };
  React.useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  // The anchor's on-screen position is only captured at open time — a scroll
  // would leave the panel pointing at the wrong spot, so just close it.
  React.useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  return (
    <span
      ref={triggerRef}
      style={{ position: "relative", display: "inline-flex" }}
      onMouseEnter={show}
      onMouseLeave={scheduleHide}
    >
      {trigger}
      {open &&
        pos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            role="tooltip"
            onMouseEnter={show}
            onMouseLeave={scheduleHide}
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              right: pos.right,
              zIndex: 1000,
              minWidth: 280,
              maxWidth: 380,
              maxHeight: 320,
              overflowY: "auto",
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              boxShadow: "0 12px 28px rgba(0,0,0,.28)",
              padding: 6,
            }}
          >
            {children}
          </div>,
          document.body,
        )}
    </span>
  );
}
