/* hooks/ci.ts — React Query hooks for the Export-to-CI wizard, the CI tab
   (agent editor), and the global CI Runs page (SPEC-06). All network access
   goes through `api` — never `fetch` directly. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { CiExport, CiExportInputBody, CiInstallation, CiRun } from "@devdigest/shared";

/**
 * One CI installation plus the status of its most recent run — response
 * shape of `GET /agents/:id/ci`. The server composes this from two existing
 * contracts (`CiInstallation` + `CiRun`) locally as `CiInstallationStatus`
 * (`server/src/modules/ci/service.ts`) without mirroring it to
 * `vendor/shared`, so it's typed here the same way `EvalDashboardAgentRow`
 * is in `./evals.ts` — a local read-model type, not a shared contract.
 */
export interface CiInstallationStatus {
  installation: CiInstallation;
  last_run: CiRun | null;
  /** Recent run history for this installation (last ~10, `ran_at` desc) —
   *  Pass 8 CI tab renders this without a new endpoint. */
  runs: CiRun[];
}

/** Installations for one agent, each with its latest run's status (AC-5/AC-7). */
export function useAgentCi(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["agent-ci", agentId],
    queryFn: () => api.get<CiInstallationStatus[]>(`/agents/${agentId}/ci`),
    enabled: !!agentId,
  });
}

/**
 * Export a CI bundle for an agent (`POST /agents/:id/export-ci`). On success,
 * invalidates the agent's CI installations so the CI tab reflects the new
 * (or updated) installation (AC-2).
 */
export function useExportCi(agentId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CiExportInputBody) =>
      api.post<CiExport>(`/agents/${agentId}/export-ci`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agent-ci", agentId] });
    },
  });
}

/** All CI runs across the workspace, newest first (AC-29). May be empty —
 *  this feature never ingests `ci_runs` itself (SPEC-05 D-6). */
export function useCiRuns() {
  return useQuery({
    queryKey: ["ci-runs"],
    queryFn: () => api.get<CiRun[]>("/ci/runs"),
  });
}
