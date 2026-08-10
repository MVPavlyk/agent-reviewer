import type { IconName } from "@devdigest/ui";

/** Detail-tab descriptor. `labelKey` resolves under the `skills` namespace,
 *  `detail.tabs.*`. No Evals tab — no eval-running infra for skills yet
 *  (docs/specs/skills.md Extension). */
export interface DetailTab {
  key: string;
  labelKey: string;
  icon: IconName;
}

export const TABS: readonly DetailTab[] = [
  { key: "config", labelKey: "detail.tabs.config", icon: "Settings" },
  { key: "preview", labelKey: "detail.tabs.preview", icon: "Eye" },
  { key: "stats", labelKey: "detail.tabs.stats", icon: "BarChart" },
  { key: "versions", labelKey: "detail.tabs.versions", icon: "History" },
];

export const DEFAULT_TAB = "config";
