/** Constants for the DiffViewer. */
import type { SmartDiffRole } from "@devdigest/shared";

/** Files with this many or fewer changed lines start expanded. */
export const AUTO_EXPAND_MAX_LINES = 200;

/** Matches a unified-diff hunk header, e.g. `@@ -1,2 +1,3 @@`. */
export const HUNK_HEADER_RE = /@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/** Smart Diff role indicator: a colour token (CSS var) + the i18n keys
 *  (under `shell.diffViewer.role.<role>.*`) for its label and italic hint. */
export const SMART_DIFF_ROLE_META: Record<
  SmartDiffRole,
  { color: string; labelKey: string; hintKey: string }
> = {
  core: { color: "var(--ok)", labelKey: "diffViewer.role.core.label", hintKey: "diffViewer.role.core.hint" },
  wiring: { color: "var(--accent)", labelKey: "diffViewer.role.wiring.label", hintKey: "diffViewer.role.wiring.hint" },
  boilerplate: {
    color: "var(--text-muted)",
    labelKey: "diffViewer.role.boilerplate.label",
    hintKey: "diffViewer.role.boilerplate.hint",
  },
};

/** Group render order — fixed regardless of which groups are non-empty. */
export const SMART_DIFF_ROLE_ORDER: SmartDiffRole[] = ["core", "wiring", "boilerplate"];
