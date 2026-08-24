/* hooks/evals.ts — React Query hooks for the L-06 eval pipeline (agent Evals
   tab, Eval Dashboard, Compare modal, "Turn into eval case" on FindingCard).
   All network access goes through `api` — never `fetch` directly. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  EvalBatchRecord,
  EvalBatchStatus,
  EvalCaseRecord,
  EvalCompare,
} from "@devdigest/shared";

/** One row of `GET /evals/dashboard` — one agent with ≥1 eval case, its
 *  latest batch (or `null` if it has never run), and its case count. Server
 *  doesn't validate this response with a shared Zod contract (no response
 *  schema on the route), so it's typed locally — same pattern as `ActiveRun`
 *  in `./reviews.ts`. */
export interface EvalDashboardAgentRow {
  agent_id: string;
  agent_name: string;
  agent_enabled: boolean;
  cases_total: number;
  latest_batch: EvalBatchRecord | null;
}

/** Response of `GET /eval-runs/:batchId` — poll-friendly: the batch itself +
 *  how many of its cases have a run row yet. */
export interface EvalBatchPoll {
  batch: EvalBatchRecord;
  completed_cases: number;
}

/** Response of `POST /agents/:id/eval-runs` — returned immediately, before
 *  the batch finishes executing (status is always `'running'` on return). */
export interface StartBatchResult {
  batch_id: string;
  status: EvalBatchStatus;
}

/** An agent's eval cases, each with its most recent run's status. */
export function useAgentEvalCases(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["agent-eval-cases", agentId],
    queryFn: () => api.get<EvalCaseRecord[]>(`/agents/${agentId}/eval-cases`),
    enabled: !!agentId,
  });
}

/** An agent's eval run batches, newest first. */
export function useAgentEvalBatches(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["agent-eval-batches", agentId],
    queryFn: () => api.get<EvalBatchRecord[]>(`/agents/${agentId}/eval-runs`),
    enabled: !!agentId,
  });
}

/**
 * One batch, suitable for polling. `refetchInterval` is controlled by the
 * caller (2000ms while `status === 'running'`, `false` otherwise) — the
 * interval constant lives in the consuming component, not in this hook.
 */
export function useEvalBatch(
  batchId: string | null | undefined,
  refetchInterval: number | false = false,
) {
  return useQuery({
    queryKey: ["eval-batch", batchId],
    queryFn: () => api.get<EvalBatchPoll>(`/eval-runs/${batchId}`),
    enabled: !!batchId,
    refetchInterval,
  });
}

/** Both batch snapshots + a per-case presence/pass comparison row. */
export function useEvalCompare(
  batchIdA: string | null | undefined,
  batchIdB: string | null | undefined,
) {
  return useQuery({
    queryKey: ["eval-compare", batchIdA, batchIdB],
    queryFn: () => api.get<EvalCompare>(`/eval-runs/compare?a=${batchIdA}&b=${batchIdB}`),
    enabled: !!batchIdA && !!batchIdB,
  });
}

/** One row per agent with ≥1 eval case: its latest batch + case count. */
export function useEvalDashboard() {
  return useQuery({
    queryKey: ["eval-dashboard"],
    queryFn: () => api.get<EvalDashboardAgentRow[]>("/evals/dashboard"),
  });
}

/** Start a batch ("Run all evals") for an agent — returns immediately with
 *  `batch_id` + `status: 'running'`, before the batch finishes executing. */
export function useRunAgentEvals(agentId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { label?: string }) =>
      api.post<StartBatchResult>(`/agents/${agentId}/eval-runs`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agent-eval-batches", agentId] });
      qc.invalidateQueries({ queryKey: ["agent-eval-cases", agentId] });
    },
  });
}

/** Turn a resolved (accepted/dismissed) finding into an eval case owned by
 *  the review's agent. Idempotent server-side — a repeat call for the same
 *  finding returns the same `case_id`. */
export function useCreateEvalCaseFromFinding() {
  return useMutation({
    mutationFn: (findingId: string) =>
      api.post<{ case_id: string }>(`/findings/${findingId}/eval-case`),
  });
}
