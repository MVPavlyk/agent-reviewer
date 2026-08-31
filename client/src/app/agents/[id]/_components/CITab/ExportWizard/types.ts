/* types.ts — local (non-shared) types for the Export-to-CI wizard's ephemeral
   selections (NFR-4: client `useState` in the container, never URL/store). */
import type { CiTarget } from "@devdigest/shared";

export type WizardTarget = CiTarget;
export type PostAs = "github_review" | "pr_comment" | "none";
/** Which Install card is the active selection — both "files" (zip download)
 *  and "open_pr" (real PR via `action:'open_pr'`) are functional (ADDENDUM
 *  v2 decision 1). */
export type InstallOption = "files" | "open_pr";
export type WizardStep = 0 | 1 | 2 | 3;

/** Result surfaced after a successful install — drives InstallStep's
 *  success view (PR link and/or the once-only ingest token). */
export interface InstallResult {
  prUrl: string | null;
  ingestToken: string | null;
}
