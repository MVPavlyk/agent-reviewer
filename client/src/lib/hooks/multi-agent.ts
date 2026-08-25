/* hooks/multi-agent.ts — React Query hooks for Multi-Agent Review (SPEC-05/06).
   Start a fan-out run, read its columns/conflicts live, and pull the pre-run
   time·cost estimate for a candidate agent set. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
// Type-only — a runtime import of a value from @devdigest/shared's barrel
// would drag the whole vendored contract set into the client bundle.
import type { MultiAgentRun, AgentEstimates, MultiAgentRunSummary } from "@devdigest/shared";

// ---- Start a multi-agent run (POST /pulls/:id/multi-agent-run) ----
export interface RunMultiAgentInput {
  prId: string;
  agentIds: string[];
}

/** Kicks off a fan-out run. Does NOT navigate on error (EC-7) — the caller
 *  (Configure run / the PR-page picker) decides what an error state looks
 *  like and only navigates on success. */
export function useRunMultiAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ prId, agentIds }: RunMultiAgentInput) =>
      api.post<MultiAgentRun>(`/pulls/${prId}/multi-agent-run`, { agent_ids: agentIds }),
    onSuccess: (data, { prId }) => {
      qc.invalidateQueries({ queryKey: ["multi-agent", prId] });
      qc.setQueryData(["multi-agent", prId, data.id], data);
    },
  });
}

// ---- Read a multi-agent run (GET /pulls/:id/multi-agent[/:multiRunId]) ----
/** Latest run for a PR when `multiRunId` is omitted, or one specific run.
 *  Polls (like `usePrRuns`) only while at least one column is still
 *  `running`, so it self-clears once the fan-out settles. */
export function useMultiAgentRun(prId: string | null | undefined, multiRunId?: string | null) {
  return useQuery({
    queryKey: multiRunId ? ["multi-agent", prId, multiRunId] : ["multi-agent", prId],
    queryFn: () =>
      api.get<MultiAgentRun>(
        multiRunId ? `/pulls/${prId}/multi-agent/${multiRunId}` : `/pulls/${prId}/multi-agent`,
      ),
    enabled: !!prId,
    refetchInterval: (query) =>
      (query.state.data?.columns ?? []).some((c) => c.status === "running") ? 3000 : false,
  });
}

// ---- Run history (GET /multi-agent-runs[?prId=…]) ----
/** Multi-agent run history, newest first. Scoped to one PR when `prId` is
 *  given (the PR-detail "Multi-agent runs" link); otherwise the global
 *  history landing page. */
export function useMultiAgentRuns(prId?: string | null) {
  return useQuery({
    queryKey: prId ? ["multi-agent-runs", prId] : ["multi-agent-runs"],
    queryFn: () =>
      api.get<MultiAgentRunSummary[]>(
        prId ? `/multi-agent-runs?prId=${prId}` : "/multi-agent-runs",
      ),
  });
}

// ---- Pre-run estimate (GET /agents/estimates?ids=…) ----
/** Estimate for a candidate agent set. `agentIds` empty → the query stays
 *  disabled (no request, no partial UI) until at least one agent is picked. */
export function useAgentEstimates(agentIds: string[]) {
  const ids = [...agentIds].sort();
  return useQuery({
    queryKey: ["agent-estimates", ids],
    queryFn: () => api.get<AgentEstimates>(`/agents/estimates?ids=${ids.join(",")}`),
    enabled: ids.length > 0,
  });
}
