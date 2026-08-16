/* schemas.ts — local Zod schemas for the TRIMMED output shapes each tool
   returns. These are NOT server contracts (server has no "summary" DTOs) —
   they exist only here, to keep tool responses small and stable
   (principle 3: a concise structured answer, not a raw dump). */

import { z } from 'zod';
import { Severity, FindingCategory, Verdict } from '@devdigest/shared';

export const AgentSummary = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  enabled: z.boolean(),
  model: z.string(),
});
export type AgentSummary = z.infer<typeof AgentSummary>;

/** Trimmed finding shape used by run_agent_on_pull_request's output. */
export const RunFindingSummary = z.object({
  severity: Severity,
  title: z.string(),
  file: z.string(),
  start_line: z.number().int(),
  end_line: z.number().int(),
  rationale: z.string(),
  suggestion: z.string().nullish(),
});
export type RunFindingSummary = z.infer<typeof RunFindingSummary>;

export const RunResultSummary = z.object({
  verdict: Verdict.nullable(),
  findings: z.array(RunFindingSummary),
});
export type RunResultSummary = z.infer<typeof RunResultSummary>;

/** Trimmed finding shape used by get_findings' output (adds `category`). */
export const FindingSummary = RunFindingSummary.extend({
  category: FindingCategory,
});
export type FindingSummary = z.infer<typeof FindingSummary>;

export const ReviewSummary = z.object({
  agent: z.string().nullable(),
  verdict: Verdict.nullable(),
  score: z.number().int().nullable(),
  findings: z.array(FindingSummary),
});
export type ReviewSummary = z.infer<typeof ReviewSummary>;

export const ConventionSummary = z.object({
  title: z.string(),
  rule: z.string(),
  status: z.enum(['pending', 'accepted', 'rejected']),
  evidence_path: z.string().nullable(),
  confidence: z.number().min(0).max(1).nullable(),
});
export type ConventionSummary = z.infer<typeof ConventionSummary>;
