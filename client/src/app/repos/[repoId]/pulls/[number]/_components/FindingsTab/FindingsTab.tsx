"use client";

import React, { useCallback } from "react";
import { Icon, Badge, Button, SectionLabel, EmptyState } from "@devdigest/ui";
import { RunStatus } from "../RunStatus";
import { RunHistory } from "../RunHistory/RunHistory";
import { ReviewRunAccordion } from "../ReviewRunAccordion";
import { s } from "./styles";
import { SeverityCounts as SeverityCountsBadges, type SeverityLevel } from "@/components/severity-counts";
import type {
  FindingRecord,
  ReviewRecord,
  RunSummary,
  PrCommit,
  SeverityCounts,
} from "@devdigest/shared";
import type { UseMutationResult } from "@tanstack/react-query";

interface FindingsTabProps {
  prId: string | null;
  /** Used to build the Timeline popover's "open this finding" navigation URL. */
  repoId: string;
  prNumber: number;
  liveRunIds: string[];
  reviewRunning: boolean;
  lethalTrifecta: FindingRecord[];
  runs: ReviewRecord[];
  prRuns: RunSummary[] | undefined;
  prCommits: PrCommit[];
  cancelMutation: UseMutationResult<any, any, string, any>;
  /** owner/repo + head sha — used to deep-link a finding's file:line to GitHub. */
  repoFullName?: string | null;
  headSha?: string | null;
  /** Severity breakdown across all runs — drives the counter row above
   *  "Review runs" and (via selectedSeverity) filters it. */
  severityCounts: SeverityCounts;
  selectedSeverity: SeverityLevel | null;
  onSelectSeverity: (level: SeverityLevel | null) => void;
  /** From the URL's `findingItem` param — a finding clicked in the Timeline
   *  popover. Opens + scrolls to its accordion/card, then fires
   *  onFocusedFindingHandled so the param is dropped (never re-triggers on reload). */
  focusFindingId?: string | null;
  onFocusedFindingHandled?: () => void;
  onOpenTrace: (id: string) => void;
  onDelete: (id: string) => void;
  onRunDone: () => void;
}

export function FindingsTab({
  prId,
  repoId,
  prNumber,
  liveRunIds,
  reviewRunning,
  lethalTrifecta,
  runs,
  prRuns,
  prCommits,
  cancelMutation,
  repoFullName,
  headSha,
  severityCounts,
  selectedSeverity,
  onSelectSeverity,
  focusFindingId,
  onFocusedFindingHandled,
  onOpenTrace,
  onDelete,
  onRunDone,
}: FindingsTabProps) {
  const handleCancelAll = useCallback(() => {
    liveRunIds.forEach((id) => cancelMutation.mutate(id));
  }, [liveRunIds, cancelMutation]);

  const handleOpenFirstTrace = useCallback(() => {
    if (liveRunIds[0]) onOpenTrace(liveRunIds[0]);
  }, [liveRunIds, onOpenTrace]);

  const handleOpenTrace = useCallback(
    (id: string) => {
      onOpenTrace(id);
    },
    [onOpenTrace],
  );

  const handleDelete = useCallback(
    (id: string) => {
      onDelete(id);
    },
    [onDelete],
  );

  const costByRunId = React.useMemo(() => {
    const m = new Map<string, number | null>();
    for (const r of prRuns ?? []) m.set(r.run_id, r.cost_usd);
    return m;
  }, [prRuns]);

  // Per-run findings for the Timeline — sourced from ReviewRecord (which
  // carries real findings, unlike agent_runs' denormalized aggregate). Drives
  // both the severity-icon counts and their hover preview popover.
  const findingsByRunId = React.useMemo(() => {
    const m = new Map<string, FindingRecord[]>();
    for (const r of runs) if (r.run_id) m.set(r.run_id, r.findings);
    return m;
  }, [runs]);

  // Timeline → Review-runs navigation: clicking an agent name in the timeline
  // (or a finding in its hover popover) opens + scrolls to that run's
  // accordion below. The nonce re-triggers the scroll even when the same run
  // is targeted twice in a row.
  const [target, setTarget] = React.useState<{ runId: string; n: number } | null>(null);
  const handleGoToReview = useCallback((runId: string) => {
    setTarget((p) => ({ runId, n: (p?.n ?? 0) + 1 }));
  }, []);

  // `?findingItem=<id>` (set by the Timeline popover's navigation link): open
  // the owning run's accordion, then scroll to the finding card itself once it
  // mounts, then drop the param so a reload doesn't re-trigger the scroll.
  React.useEffect(() => {
    if (!focusFindingId) return;
    const owner = runs.find((r) => r.findings.some((f) => f.id === focusFindingId));
    if (!owner?.run_id) {
      onFocusedFindingHandled?.();
      return;
    }
    setTarget((p) => ({ runId: owner.run_id!, n: (p?.n ?? 0) + 1 }));

    let attempts = 0;
    let raf: number;
    const tryScroll = () => {
      const el = document.querySelector(`[data-finding-id="${focusFindingId}"]`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        onFocusedFindingHandled?.();
        return;
      }
      if (attempts++ < 30) raf = requestAnimationFrame(tryScroll);
      else onFocusedFindingHandled?.();
    };
    raf = requestAnimationFrame(tryScroll);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusFindingId]);

  const findingsCount =
    severityCounts.critical + severityCounts.warning + severityCounts.suggestion;

  // When a severity is selected, only show runs that produced at least one
  // finding at that level — the run's own accordion body further narrows to
  // just that level's findings (via FindingsPanel).
  const visibleRuns = selectedSeverity
    ? runs.filter((r) => r.findings.some((f) => f.severity === selectedSeverity))
    : runs;

  return (
    <section>
      {liveRunIds.length > 0 && (
        <div style={s.liveRunSection}>
          <SectionLabel
            icon="Sparkles"
            right={
              <div style={s.cancelActions}>
                <Button
                  kind="danger"
                  size="sm"
                  icon="X"
                  loading={cancelMutation.isPending}
                  onClick={handleCancelAll}
                >
                  Cancel
                </Button>
                <Button kind="ghost" size="sm" icon="FileText" onClick={handleOpenFirstTrace}>
                  Open run trace
                </Button>
              </div>
            }
          >
            Live review
          </SectionLabel>
          <RunStatus runIds={liveRunIds} onDone={onRunDone} />
        </div>
      )}

      {reviewRunning && (
        <div style={s.reviewInProgress}>
          <Icon.RefreshCw size={16} style={{ color: "var(--accent)", animation: "ddspin 1s linear infinite" }} />
          <span style={s.reviewInProgressText}>Review in progress…</span>
          <span style={s.reviewInProgressSub}>
            the agent is analyzing the diff — this can take a while on large PRs.
          </span>
        </div>
      )}

      {lethalTrifecta.length > 0 && (
        <div style={s.lethalTrifecta}>
          <Icon.Shield size={16} style={{ color: "var(--crit)" }} />
          <span style={s.lethalTrifectaTitle}>Lethal Trifecta detected</span>
          <Badge color="var(--crit)" bg="transparent">
            {lethalTrifecta.length} finding(s)
          </Badge>
        </div>
      )}

      {((prRuns && prRuns.length > 0) || prCommits.length > 0) && (
        <div style={s.timelineSection}>
          <SectionLabel
            icon="Activity"
            right={<span style={{ fontSize: 12, color: "var(--text-muted)" }}>runs &amp; commits · newest first</span>}
          >
            Timeline
          </SectionLabel>
          <RunHistory
            runs={prRuns ?? []}
            commits={prCommits}
            findingsByRunId={findingsByRunId}
            repoId={repoId}
            prNumber={prNumber}
            onSelectSeverity={onSelectSeverity}
            onOpenTrace={handleOpenTrace}
            onGoToReview={handleGoToReview}
            onDelete={handleDelete}
          />
        </div>
      )}

      {findingsCount > 0 && (
        <div style={s.severityCountsRow}>
          <SeverityCountsBadges
            variant="detailed"
            counts={severityCounts}
            selected={selectedSeverity}
            onSelect={onSelectSeverity}
          />
        </div>
      )}

      <SectionLabel
        icon="AlertOctagon"
        right={<span style={{ fontSize: 12, color: "var(--text-muted)" }}>grouped by run · newest first</span>}
      >
        Review runs
      </SectionLabel>
      {runs.length === 0 ? (
        reviewRunning || liveRunIds.length > 0 ? null : (
          <EmptyState
            icon="Sparkles"
            title="No findings yet"
            body="Run a review to generate findings. Use Run Review ▾ above (run all enabled agents or a specific one)."
          />
        )
      ) : visibleRuns.length === 0 ? (
        <EmptyState icon="Filter" title="No matching runs" body="No run produced a finding at this severity." />
      ) : (
        prId &&
        visibleRuns.map((review, i) => (
          <ReviewRunAccordion
            key={review.id}
            review={review}
            prId={prId}
            defaultOpen={i === 0}
            repoFullName={repoFullName}
            headSha={headSha}
            targetRunId={target?.runId ?? null}
            targetNonce={target?.n ?? 0}
            costUsd={review.run_id ? costByRunId.get(review.run_id) ?? null : null}
            severityFilter={selectedSeverity}
            focusFindingId={focusFindingId}
          />
        ))
      )}
    </section>
  );
}
