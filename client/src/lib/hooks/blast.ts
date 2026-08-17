/* hooks/blast.ts — React Query hook for the blast-radius tab.
     GET /pulls/:id/blast → BlastRadius (changed symbols, downstream impact,
                            status/coverage — never throws on a partial index). */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { BlastRadius } from "@/vendor/shared";

/** GET /pulls/:id/blast → current blast-radius result for the PR's HEAD. */
export function usePrBlast(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["pr-blast", prId],
    queryFn: () => api.get<BlastRadius>(`/pulls/${prId}/blast`),
    enabled: !!prId,
  });
}
