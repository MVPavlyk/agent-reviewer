"use client";

import { useTranslations } from "next-intl";
import { usePrReviews } from "@/lib/hooks/reviews";
import { FindingsPreviewList } from "./FindingsPreviewList";
import { visibleSortedFindings } from "./helpers";

/** Popover body for the PR-LIST findings cell. Unlike the PR-detail Timeline
 *  (which already has each run's ReviewRecord in hand), the list only carries
 *  aggregate counts (`PrMeta.findings`) — real findings aren't fetched until
 *  hovered. Lazy: this only mounts while the popover is open, so it only
 *  fetches on hover, and reuses the same `["reviews", prId]` query the PR
 *  detail page uses — already warm if the user opens that PR next. */
export function PrFindingsPreview({
  prId,
  repoId,
  prNumber,
}: {
  prId: string | null | undefined;
  repoId: string;
  prNumber: number;
}) {
  const t = useTranslations("common");
  const { data: reviews, isLoading } = usePrReviews(prId);

  if (isLoading) {
    return (
      <div style={{ padding: "10px 12px", fontSize: 12, color: "var(--text-muted)" }}>
        {t("states.loading")}
      </div>
    );
  }

  const findings = visibleSortedFindings((reviews ?? []).flatMap((r) => r.findings));
  if (findings.length === 0) return null;

  return <FindingsPreviewList findings={findings} repoId={repoId} prNumber={prNumber} />;
}
