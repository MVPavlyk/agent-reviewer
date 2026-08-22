/* hooks/context-docs.ts — React Query hooks over the SPEC-01 context-docs
   API: the repo-level scan (`/repos/:repoId/context-docs[/refresh|/content]`)
   and the agent/skill attachment sets (`/agents|/skills/:id/context-docs`).

   Deliberately separate from the dead `useContextFiles`/`useReindexContext`
   scaffolding in `./core.ts` (an unimplemented older `/repos/:id/context`
   API) — do not merge with or reuse that pair. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { ContextDoc, ContextDocContent, ContextDocLink, ContextDocsResponse } from "../types";

/** Query key shared by the Project Context page and both attachment tabs —
 *  `used_by_agents` on each doc changes whenever an agent/skill attachment
 *  set changes, so every mutation below also invalidates this key. */
function contextDocsKey(repoId: string | null | undefined) {
  return ["context-docs", repoId] as const;
}

export function useContextDocs(repoId: string | null | undefined) {
  return useQuery({
    queryKey: contextDocsKey(repoId),
    queryFn: () => api.get<ContextDocsResponse>(`/repos/${repoId}/context-docs`),
    enabled: !!repoId,
  });
}

/** Rescans the repo's clone and invalidates the shared `context-docs` cache
 *  (never fired on mount — only from an explicit user click, per the
 *  StrictMode mutate-on-mount pitfall noted in client/INSIGHTS.md). */
export function useRefreshContextDocs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (repoId: string) =>
      api.post<ContextDocsResponse>(`/repos/${repoId}/context-docs/refresh`),
    onSuccess: (data, repoId) => {
      qc.setQueryData(contextDocsKey(repoId), data);
    },
  });
}

/** Preview of one doc's content, truncated server-side. `path` is sent as a
 *  query param — always percent-encoded, never interpolated raw. */
export function useContextDocContent(repoId: string | null | undefined, path: string | null | undefined) {
  return useQuery({
    queryKey: ["context-doc-content", repoId, path],
    queryFn: () =>
      api.get<ContextDocContent>(
        `/repos/${repoId}/context-docs/content?path=${encodeURIComponent(path!)}`,
      ),
    enabled: !!repoId && !!path,
  });
}

/** Own + inherited (source:'skill') attachments for an agent. */
export function useAgentContextDocs(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["agent-context-docs", agentId],
    queryFn: () => api.get<ContextDocLink[]>(`/agents/${agentId}/context-docs`),
    enabled: !!agentId,
  });
}

/** Replaces an agent's OWN attachment set (order = array index). Also
 *  invalidates the repo-level scan, since `used_by_agents` shifts. */
export function useSetAgentContextDocs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ agentId, repoId, paths }: { agentId: string; repoId: string; paths: string[] }) =>
      api.post<ContextDocLink[]>(`/agents/${agentId}/context-docs`, { paths }),
    onSuccess: (_data, { agentId, repoId }) => {
      qc.invalidateQueries({ queryKey: ["agent-context-docs", agentId] });
      qc.invalidateQueries({ queryKey: contextDocsKey(repoId) });
    },
  });
}

/** A skill's own attachments (no inherited rows — skills don't nest). */
export function useSkillContextDocs(skillId: string | null | undefined) {
  return useQuery({
    queryKey: ["skill-context-docs", skillId],
    queryFn: () => api.get<ContextDocLink[]>(`/skills/${skillId}/context-docs`),
    enabled: !!skillId,
  });
}

export function useSetSkillContextDocs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ skillId, repoId, paths }: { skillId: string; repoId: string; paths: string[] }) =>
      api.post<ContextDocLink[]>(`/skills/${skillId}/context-docs`, { paths }),
    onSuccess: (_data, { skillId, repoId }) => {
      qc.invalidateQueries({ queryKey: ["skill-context-docs", skillId] });
      qc.invalidateQueries({ queryKey: contextDocsKey(repoId) });
    },
  });
}

export type { ContextDoc };
