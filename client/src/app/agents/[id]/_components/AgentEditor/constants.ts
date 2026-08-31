import type { IconName } from "@devdigest/ui";

/** Editor tab descriptor. `labelKey` resolves under the `agents` namespace. */
export interface EditorTab {
  key: string;
  labelKey: string;
  icon: IconName;
}

/** Editor tabs. Part-0 shipped Config only; L-02 added Skills; Project
 *  Context adds Context; L-06 adds Evals; Export-to-CI (SPEC-06 Pass 8) adds
 *  CI. Stats stays out of scope (Non-goals) — CI no longer does. */
export const TABS: readonly EditorTab[] = [
  { key: "config", labelKey: "editor.tabs.config", icon: "Settings" },
  { key: "skills", labelKey: "editor.tabs.skills", icon: "Sparkles" },
  { key: "context", labelKey: "editor.tabs.context", icon: "FileText" },
  { key: "evals", labelKey: "editor.tabs.evals", icon: "Target" },
  { key: "ci", labelKey: "editor.tabs.ci", icon: "Workflow" },
];
