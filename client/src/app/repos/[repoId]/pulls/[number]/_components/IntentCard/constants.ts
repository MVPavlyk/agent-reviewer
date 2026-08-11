import type { IntentSource } from "@devdigest/shared";
import type { IconName } from "@devdigest/ui";

/** Display order — matches `intent.sourceLabel.*` in prReview.json. */
export const SOURCE_ORDER: IntentSource[] = [
  "title",
  "description",
  "linked_issue",
  "plan_doc",
  "file_list",
  "hunk_headers",
];

/** Icon per source, shown on its chip in the meta row. */
export const SOURCE_ICON: Record<IntentSource, IconName> = {
  title: "Hash",
  description: "FileText",
  linked_issue: "GitCommit",
  plan_doc: "Link",
  file_list: "Folder",
  hunk_headers: "Code",
};
