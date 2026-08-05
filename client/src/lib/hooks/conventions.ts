/* hooks/conventions.ts — React Query hooks for the Conventions page (Skills
   Lab). Mirrors hooks/skills.ts's structure. Detection runs as a background
   job server-side, so `useConventions` self-polls while the latest scan is
   still `running` (mirrors the gated-refetchInterval pattern in hooks/reviews.ts),
   and stops on its own once the status goes terminal — no caller-owned `poll`
   flag needed (unlike hooks/repo-intel.ts, whose index status has no terminal
   marker of its own). */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { ConventionCandidate, ConventionsListResponse, Skill, SkillType } from "@devdigest/shared";

export function useConventions(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["conventions", repoId],
    queryFn: () => api.get<ConventionsListResponse>(`/repos/${repoId}/conventions`),
    enabled: !!repoId,
    refetchInterval: (query) =>
      query.state.data?.latest_scan?.status === "running" ? 3000 : false,
  });
}

export interface RescanResult {
  status: "accepted";
  job_id: string | null;
  scan_id: string;
}

export function useRescanConventions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (repoId: string) =>
      api.post<RescanResult>(`/repos/${repoId}/conventions/rescan`),
    onSuccess: (_data, repoId) => qc.invalidateQueries({ queryKey: ["conventions", repoId] }),
  });
}

export interface UpdateConventionInput {
  id: string;
  repoId: string;
  action: "accept" | "reject";
}

export function useUpdateConvention() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: UpdateConventionInput) =>
      api.post<ConventionCandidate>(`/conventions/${id}/${action}`),
    onSuccess: (_data, { repoId }) => qc.invalidateQueries({ queryKey: ["conventions", repoId] }),
  });
}

/** "Deselect all" — bulk-reverts every accepted convention in the repo back
 *  to pending. Distinct from reject: a reset can be re-accepted freely and
 *  doesn't exclude the convention from a future scan's suggestions. */
export function useResetAcceptedConventions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (repoId: string) =>
      api.post<{ reset: number }>(`/repos/${repoId}/conventions/reset-accepted`),
    onSuccess: (_data, repoId) => qc.invalidateQueries({ queryKey: ["conventions", repoId] }),
  });
}

export interface ConventionSkillDraft {
  name: string;
  description: string;
  type: SkillType;
  source: "extracted";
  body: string;
}

/** Stateless merge preview — no draft row server-side, so nothing to cache/invalidate. */
export function useConventionSkillDraft() {
  return useMutation({
    mutationFn: (conventionIds: string[]) =>
      api.post<ConventionSkillDraft>("/conventions/skill-draft", { convention_ids: conventionIds }),
  });
}

export interface CreateSkillFromConventionsInput {
  convention_ids: string[];
  name: string;
  description: string;
  type: SkillType;
  body: string;
}

export function useCreateSkillFromConventions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSkillFromConventionsInput) =>
      api.post<Skill>("/conventions/create-skill", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["skills"] }),
  });
}
