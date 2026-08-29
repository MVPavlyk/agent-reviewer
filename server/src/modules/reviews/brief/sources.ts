import type { Container } from '../../../platform/container.js';
import type { BlastRadius, Intent, IssueMeta, UnifiedDiff } from '@devdigest/shared';
import type * as schema from '../../../db/schema.js';
import type { PullRow } from '../../../db/rows.js';
import { resolveContextDocs } from '../../context-docs/resolve.js';
import { readContextDocsForRun, type ReadContextDocsLog } from '../../context-docs/read-for-run.js';

/**
 * Brief Layer — data collection. Gathers everything `generateBrief` needs
 * WITHOUT ever reading a diff hunk's body (mirrors `intent/sources.ts`):
 * title, description, linked issue, the already-classified Intent, a
 * PROMPT-SAFE view of the blast radius (`toBlastPromptView` — no
 * `coverage`/`rank`/`depth`), the changed-file list, hunk HEADERS, and any
 * relevant project spec documents (already collected by
 * `collectBriefContextDocs`, passed in).
 *
 * Degradation is explicit, never silent: any failure to collect an input is
 * best-effort — logged and skipped, never thrown (AC-4, AC-5, NFR-4).
 */

/** Only the fields the brief prompt actually needs from a `BlastCaller`. */
export interface BlastPromptCaller {
  file: string;
  name: string;
}

/** Only the fields the brief prompt actually needs from a `BlastRef`
 *  (endpoint/cron) — `via_symbol`/`via_file`/`depth` are dropped (AC-3). */
export interface BlastPromptRef {
  value: string;
  file: string;
}

export interface BlastPromptDownstream {
  symbol: string;
  callers: BlastPromptCaller[];
  endpoints_affected: BlastPromptRef[];
  crons_affected: BlastPromptRef[];
}

/** A prompt-safe projection of `BlastRadius` — deliberately excludes
 *  `coverage`, `BlastCaller.rank`, and `BlastRef.depth`/`via_symbol`/
 *  `via_file` (AC-3): those are UI/ranking metadata, not evidence a reviewer
 *  needs restated in prose. */
export interface BlastPromptView {
  summary: string;
  status: BlastRadius['status'];
  reason: BlastRadius['reason'];
  message: string;
  changed_symbols: { name: string; file: string }[];
  downstream: BlastPromptDownstream[];
}

export function toBlastPromptView(blast: BlastRadius): BlastPromptView {
  return {
    summary: blast.summary,
    status: blast.status,
    reason: blast.reason,
    message: blast.message,
    changed_symbols: blast.changed_symbols.map((s) => ({ name: s.name, file: s.file })),
    downstream: blast.downstream.map((d) => ({
      symbol: d.symbol,
      callers: d.callers.map((c) => ({ file: c.file, name: c.name })),
      endpoints_affected: d.endpoints_affected.map((r) => ({ value: r.value, file: r.file })),
      crons_affected: d.crons_affected.map((r) => ({ value: r.value, file: r.file })),
    })),
  };
}

export interface BriefSourceBundle {
  title: string;
  /** null when the PR has no (non-blank) body. */
  description: string | null;
  linkedIssue: IssueMeta | null;
  intent: Intent;
  blast: BlastPromptView;
  fileList: { path: string; additions: number; deletions: number }[];
  /** `@@ -oldStart,oldLines +newStart,newLines @@` per hunk — NEVER diff bodies. */
  hunkHeaders: string[];
  /** `# <path>\n\n<content>` blocks from `collectBriefContextDocs` (EC-11: empty when none). */
  specs: string[];
  /** Set when the blast radius itself degraded (status/reason) — surfaced in
   *  the prompt so the model knows its downstream-impact evidence is thin. */
  blastNotice: string | null;
}

/** Same shape the Intent Layer's own linked-issue matcher uses
 *  (`intent/sources.ts:35`) — `Closes #123`, `Fixes #45`, `Resolves #7`, or a
 *  bare `#123`. */
const ISSUE_REF_RE = /(?:closes|fixes|resolves)?\s*#(\d+)/i;

const DEGRADED_BLAST_REASONS = new Set(['diff_not_loaded', 'no_index']);

export async function collectBriefSources(
  container: Container,
  repoRow: typeof schema.repos.$inferSelect,
  pull: PullRow,
  diff: UnifiedDiff,
  intent: Intent,
  blast: BlastRadius,
  specs: string[],
): Promise<BriefSourceBundle> {
  const description = pull.body && pull.body.trim().length > 0 ? pull.body : null;

  let linkedIssue: IssueMeta | null = null;
  const issueMatch = pull.body?.match(ISSUE_REF_RE);
  if (issueMatch?.[1]) {
    try {
      const github = await container.github();
      linkedIssue = await github.getIssue({ owner: repoRow.owner, name: repoRow.name }, Number(issueMatch[1]));
    } catch {
      // Best-effort: an unreachable linked issue never blocks brief generation (AC-5).
    }
  }

  const fileList = diff.files.map((f) => ({ path: f.path, additions: f.additions, deletions: f.deletions }));
  const hunkHeaders = diff.files.flatMap((f) =>
    f.hunks.map((h) => `${f.path} @@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@`),
  );

  const blastNotice =
    blast.status === 'degraded' || (blast.reason && DEGRADED_BLAST_REASONS.has(blast.reason))
      ? blast.message
      : null;

  return {
    title: pull.title,
    description,
    linkedIssue,
    intent,
    blast: toBlastPromptView(blast),
    fileList,
    hunkHeaders,
    specs,
    blastNotice,
  };
}

/**
 * Brief Layer — project-context specs (SPEC-03 AC-7, Q-1). `resolveContextDocs`
 * is agent-scoped and the brief runs without one, so this collects the union
 * of context docs across every ENABLED agent in the workspace
 * (`container.agentsRepo.listEnabled`), then dedupes them through the same
 * pure `resolveContextDocs({ skills: [], agentDocs })` the run-executor uses
 * (first occurrence wins) before reading them from the repo's own clone via
 * `readContextDocsForRun` (mirrors `run-executor.ts:257-288`).
 *
 * No `clonePath` or an empty resolved list → `[]` (EC-11) — never throws.
 */
export async function collectBriefContextDocs(
  container: Container,
  workspaceId: string,
  repoRow: typeof schema.repos.$inferSelect,
  log: ReadContextDocsLog,
): Promise<string[]> {
  if (!repoRow.clonePath) return [];

  const agents = await container.agentsRepo.listEnabled(workspaceId);
  const agentDocLists = await Promise.all(
    agents.map((agent) => container.contextDocsRepo.listForAgent(agent.id)),
  );
  const agentDocs = agentDocLists.flat().map((d) => ({ path: d.path, order: d.order }));
  if (agentDocs.length === 0) return [];

  const resolved = resolveContextDocs({ skills: [], agentDocs });
  if (resolved.length === 0) return [];

  const read = await readContextDocsForRun(repoRow.clonePath, resolved, log, container.config.contextDocRoots);
  return read.specs;
}
