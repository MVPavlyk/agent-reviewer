import { z } from 'zod';

/**
 * PR Brief building blocks: Intent, Blast radius, Risks, PR History,
 * Smart Diff. Composed into PrBrief.
 */

// ---- Intent ----
/** How much of the classifier's own input it actually had to work with. */
export const IntentConfidence = z.enum(['high', 'low']);
export type IntentConfidence = z.infer<typeof IntentConfidence>;

/** Which raw inputs fed the intent classification (never diff bodies — see
 *  `server/src/modules/reviews/intent/sources.ts`). */
export const IntentSource = z.enum([
  'title',
  'description',
  'linked_issue',
  'plan_doc',
  'file_list',
  'hunk_headers',
]);
export type IntentSource = z.infer<typeof IntentSource>;

export const Intent = z.object({
  summary: z.string(),
  in_scope: z.array(z.string()),
  out_of_scope: z.array(z.string()),
});
export type Intent = z.infer<typeof Intent>;

// ---- Blast radius ----
export const ChangedSymbol = z.object({
  name: z.string(),
  file: z.string(),
  kind: z.string(),
});
export type ChangedSymbol = z.infer<typeof ChangedSymbol>;

export const BlastCaller = z.object({
  name: z.string(),
  file: z.string(),
  line: z.number().int(),
  rank: z.number(),
});
export type BlastCaller = z.infer<typeof BlastCaller>;

/** An endpoint/cron reachable from a changed symbol — attributed with the
 *  path that reached it (caller symbol, or import-graph hop). */
export const BlastRef = z.object({
  value: z.string(),
  file: z.string(),
  via_symbol: z.string().nullable(),
  via_file: z.string(),
  depth: z.number().int(),
});
export type BlastRef = z.infer<typeof BlastRef>;

/** How much of the index the response actually drew on — lets the UI tell
 *  "no impact" apart from "nothing analyzed". */
export const BlastCoverage = z.object({
  changed_files: z.array(z.string()),
  analyzed_files: z.array(z.string()),
  unsupported_files: z.array(z.string()),
  files_without_rank: z.array(z.string()),
  indexer_version: z.number().int().nullable(),
  last_indexed_sha: z.string().nullable(),
});
export type BlastCoverage = z.infer<typeof BlastCoverage>;

export const BlastStatus = z.enum(['ok', 'partial', 'degraded']);
export type BlastStatus = z.infer<typeof BlastStatus>;

export const BlastReason = z.enum([
  'flag_off',
  'no_index',
  'index_stale',
  'index_partial',
  'index_failed',
  'repo_too_large',
  'rank_missing',
  'unsupported_files',
  'no_symbols',
  'no_data',
  // PR-level, not index-level: `pr_files` is empty because this PR's diff
  // has never been fetched from GitHub yet (lazily filled by `GET /pulls/:id`
  // — see server/src/modules/pulls/service.ts `getDetail`). Distinct from a
  // genuinely file-less PR, which reports `status: 'ok'` instead.
  'diff_not_loaded',
]);
export type BlastReason = z.infer<typeof BlastReason>;

export const DownstreamImpact = z.object({
  symbol: z.string(),
  callers: z.array(BlastCaller),
  callers_total: z.number().int(),
  callers_truncated: z.boolean(),
  endpoints_affected: z.array(BlastRef),
  crons_affected: z.array(BlastRef),
});
export type DownstreamImpact = z.infer<typeof DownstreamImpact>;

export const BlastRadius = z.object({
  changed_symbols: z.array(ChangedSymbol),
  downstream: z.array(DownstreamImpact),
  summary: z.string(),
  status: BlastStatus,
  reason: BlastReason.nullable(),
  message: z.string(),
  coverage: BlastCoverage,
  head_sha: z.string().nullable(),
});
export type BlastRadius = z.infer<typeof BlastRadius>;

// ---- Risks ----
export const RiskSeverity = z.enum(['high', 'medium', 'low']);
export type RiskSeverity = z.infer<typeof RiskSeverity>;

export const Risk = z.object({
  kind: z.string(),
  title: z.string(),
  explanation: z.string(),
  severity: RiskSeverity,
  file_refs: z.array(z.string()),
});
export type Risk = z.infer<typeof Risk>;

export const Risks = z.object({
  risks: z.array(Risk),
});
export type Risks = z.infer<typeof Risks>;

// ---- PR History ----
export const PrHistoryItem = z.object({
  pr_number: z.number().int(),
  title: z.string(),
  merged_at: z.string(),
  author: z.string(),
  files_overlap: z.array(z.string()),
  notes: z.string(),
});
export type PrHistoryItem = z.infer<typeof PrHistoryItem>;

export const PrHistory = z.object({
  history: z.array(PrHistoryItem),
});
export type PrHistory = z.infer<typeof PrHistory>;

// ---- Smart Diff ----
export const SmartDiffRole = z.enum(['core', 'wiring', 'boilerplate']);
export type SmartDiffRole = z.infer<typeof SmartDiffRole>;

export const SmartDiffFile = z.object({
  path: z.string(),
  pseudocode_summary: z.string().nullish(),
  additions: z.number().int(),
  deletions: z.number().int(),
  finding_lines: z.array(z.number().int()),
});
export type SmartDiffFile = z.infer<typeof SmartDiffFile>;

export const SmartDiffGroup = z.object({
  role: SmartDiffRole,
  files: z.array(SmartDiffFile),
});
export type SmartDiffGroup = z.infer<typeof SmartDiffGroup>;

export const ProposedSplit = z.object({
  name: z.string(),
  files: z.array(z.string()),
});
export type ProposedSplit = z.infer<typeof ProposedSplit>;

export const SmartDiff = z.object({
  groups: z.array(SmartDiffGroup),
  split_suggestion: z.object({
    too_big: z.boolean(),
    total_lines: z.number().int(),
    proposed_splits: z.array(ProposedSplit),
  }),
});
export type SmartDiff = z.infer<typeof SmartDiff>;

// ---- Composed PR Brief (pr_brief.json) ----
export const PrBrief = z.object({
  intent: Intent,
  blast: BlastRadius,
  risks: Risks,
  history: PrHistory,
});
export type PrBrief = z.infer<typeof PrBrief>;
