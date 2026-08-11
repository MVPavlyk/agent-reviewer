import type { Container } from '../../../platform/container.js';
import type { IntentSource, IssueMeta, UnifiedDiff } from '@devdigest/shared';
import type * as schema from '../../../db/schema.js';
import type { PullRow } from '../../../db/rows.js';

/**
 * Intent Layer — data collection. Gathers everything `classifyIntent` needs
 * WITHOUT ever reading a diff hunk's body: title, description, linked issue,
 * an optional plan/spec doc linked from the PR body, the changed-file list,
 * and hunk HEADERS (`@@ -a,b +c,d @@`) synthesized from `DiffHunk`, never the
 * diff lines themselves.
 *
 * Degradation is explicit, never silent: a missing/unreachable input drops
 * its label from `sources` and adds a human-readable note to `missingContext`
 * instead of throwing (GitHub/doc-fetch failures) — except this function
 * itself never throws; per-source failures are caught locally.
 */
export interface IntentSourceBundle {
  title: string;
  /** null when the PR has no (non-blank) body — `confidence` degrades to 'low'. */
  description: string | null;
  linkedIssue: IssueMeta | null;
  planDoc: { url: string; text: string } | null;
  fileList: { path: string; additions: number; deletions: number }[];
  /** `@@ -oldStart,oldLines +newStart,newLines @@` per hunk — NEVER diff bodies. */
  hunkHeaders: string[];
  /** Which of the above actually made it into the bundle. */
  sources: IntentSource[];
  /** Human-readable degradation notes (never thrown as errors). */
  missingContext: string[];
}

/** `Closes #123`, `Fixes #45`, `Resolves #7`, or a bare `#123` — same shape
 *  the GitHub adapter's own (private) linked-issue resolver uses. */
const ISSUE_REF_RE = /(?:closes|fixes|resolves)?\s*#(\d+)/i;

/** First https URL in the PR body — the plan/spec doc candidate. */
const URL_RE = /https:\/\/[^\s)>\]"']+/i;

/** Truncate a URL to `origin+pathname` before it goes into a log/note —
 *  never leak a query string (may carry tokens) into `missing_context`. */
function safeOriginPath(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return '(invalid url)';
  }
}

export async function collectIntentSources(
  container: Container,
  repoRow: typeof schema.repos.$inferSelect,
  pull: PullRow,
  diff: UnifiedDiff,
): Promise<IntentSourceBundle> {
  const sources: IntentSource[] = ['title', 'file_list', 'hunk_headers'];
  const missingContext: string[] = [];

  const description = pull.body && pull.body.trim().length > 0 ? pull.body : null;
  if (description) sources.push('description');
  else missingContext.push('PR description is empty');

  let linkedIssue: IssueMeta | null = null;
  const issueMatch = pull.body?.match(ISSUE_REF_RE);
  if (issueMatch?.[1]) {
    try {
      const github = await container.github();
      linkedIssue = await github.getIssue({ owner: repoRow.owner, name: repoRow.name }, Number(issueMatch[1]));
      sources.push('linked_issue');
    } catch (err) {
      missingContext.push(`linked issue #${issueMatch[1]} unreachable: ${(err as Error).message}`);
    }
  }

  let planDoc: { url: string; text: string } | null = null;
  const urlMatch = pull.body?.match(URL_RE);
  if (urlMatch?.[0]) {
    try {
      const doc = await container.docFetcher.fetch(urlMatch[0]);
      planDoc = { url: doc.url, text: doc.text };
      sources.push('plan_doc');
    } catch (err) {
      missingContext.push(`plan doc ${safeOriginPath(urlMatch[0])} unreachable: ${(err as Error).message}`);
    }
  }

  const fileList = diff.files.map((f) => ({ path: f.path, additions: f.additions, deletions: f.deletions }));
  const hunkHeaders = diff.files.flatMap((f) =>
    f.hunks.map((h) => `${f.path} @@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@`),
  );

  return { title: pull.title, description, linkedIssue, planDoc, fileList, hunkHeaders, sources, missingContext };
}
