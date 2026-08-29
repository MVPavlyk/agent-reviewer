/* hooks/brief.ts — PR Brief (SPEC-04). Mirrors usePrIntent/useClassifyIntent
   in ./reviews.ts: GET is cache-first (404 = "not yet generated", a normal
   empty state, not an error), POST (re-)generates and writes straight into
   the GET cache so the card never re-fetches after a mutation. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api";
import type { PrBriefRecord } from "@devdigest/shared";

/** The PR's persisted brief, or `undefined` while loading. A 404 (not yet
 *  generated) is a normal empty state, not an error — surfaced via
 *  `notFound` so PrBriefCard can render its "Generate brief" placeholder. */
export function usePrBrief(prId: string | null | undefined) {
  const query = useQuery({
    queryKey: ["pr-brief", prId],
    queryFn: () => api.get<PrBriefRecord>(`/pulls/${prId}/brief`),
    enabled: !!prId,
    retry: (failureCount, error) => (error instanceof ApiError && error.status === 404 ? false : failureCount < 2),
  });
  const notFound = query.isError && query.error instanceof ApiError && query.error.status === 404;
  return { ...query, notFound };
}

/** (Re-)generate the brief — the manual trigger (initial generate from the
 *  empty state, or the footer's "Regenerate" button, which passes `force`). */
export function useGenerateBrief(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars?: { force?: boolean }) => api.post<PrBriefRecord>(`/pulls/${prId}/brief`, vars ?? {}),
    onSuccess: (data) => {
      qc.setQueryData(["pr-brief", prId], data);
    },
  });
}
