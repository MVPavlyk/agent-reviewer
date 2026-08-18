"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card, Chip, EmptyState, ErrorState, SectionLabel, Skeleton } from "@devdigest/ui";
import { usePrBlast } from "@/lib/hooks";
import { ApiError } from "@/lib/api";
import { BlastStats } from "./_components/BlastStats/BlastStats";
import { SymbolTree } from "./_components/SymbolTree/SymbolTree";
import { BlastGraph } from "./_components/BlastGraph/BlastGraph";

type ViewMode = "tree" | "graph";

interface BlastRadiusCardProps {
  prId: string | null;
  repoFullName: string | null;
}

/** Overview-tab card: changed symbols, downstream callers, and the
 *  endpoints/crons they reach — sits next to IntentCard, not behind its own
 *  tab. Ephemeral tree/graph toggle is local client-state (not URL) — it
 *  doesn't need to survive a refresh or be shareable, unlike the page's own
 *  `?tab=`.
 *
 *  File:line links point at `coverage.last_indexed_sha` (the commit the
 *  repo-intel index actually reflects), NOT the PR's own `head_sha` — the
 *  index is built against the default branch, so for an old/stale PR those
 *  two commits can be far apart and a `head_sha` link would show the wrong
 *  code at the reported line. */
export function BlastRadiusCard({ prId, repoFullName }: BlastRadiusCardProps) {
  const t = useTranslations("blast");
  const { data: radius, isLoading, isError, error, refetch } = usePrBlast(prId);
  const [view, setView] = useState<ViewMode>("tree");

  if (isLoading) {
    return (
      <div style={{ marginBottom: 20 }}>
        <Card>
          <SectionLabel icon="GitBranch">{t("title")}</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Skeleton height={16} width={280} />
            <Skeleton height={140} />
          </div>
        </Card>
      </div>
    );
  }

  if (isError || !radius) {
    return (
      <div style={{ marginBottom: 20 }}>
        <Card>
          <SectionLabel icon="GitBranch">{t("title")}</SectionLabel>
          <ErrorState
            title="Couldn't load blast radius"
            body={error instanceof ApiError ? error.message : undefined}
            onRetry={() => refetch()}
          />
        </Card>
      </div>
    );
  }

  const hasDownstream = radius.status !== "degraded" && radius.downstream.length > 0;
  const indexedSha = radius.coverage.last_indexed_sha;
  const right = hasDownstream ? (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      {indexedSha && (
        <span style={{ fontSize: 11, color: "var(--text-muted)" }} title={indexedSha}>
          {t("coverage.indexedAt", { sha: indexedSha.slice(0, 7) })}
        </span>
      )}
      <div style={{ display: "flex", gap: 6 }}>
        <Chip active={view === "tree"} onClick={() => setView("tree")}>
          {t("view.tree")}
        </Chip>
        <Chip active={view === "graph"} onClick={() => setView("graph")}>
          {t("view.graph")}
        </Chip>
      </div>
    </div>
  ) : undefined;

  return (
    <div style={{ marginBottom: 20 }}>
      <Card>
        <SectionLabel icon="GitBranch" right={right}>
          {t("title")}
        </SectionLabel>

        {radius.status === "degraded" && (
          <div role="alert" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <strong>{t("status.degraded")}</strong>
            <span style={{ color: "var(--text-muted)" }}>{radius.message}</span>
          </div>
        )}

        {radius.status !== "degraded" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {radius.status === "partial" && (
              <div
                role="alert"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  borderLeftStyle: "solid",
                  borderLeftWidth: 3,
                  borderLeftColor: "var(--warn)",
                  background: "var(--warn-bg)",
                  borderRadius: 6,
                  padding: "8px 12px",
                }}
              >
                <strong>{t("status.partial")}</strong>
                <span style={{ color: "var(--text-muted)" }}>{radius.message}</span>
              </div>
            )}

            {!hasDownstream && (
              <EmptyState title={t("noDownstream", { count: radius.changed_symbols.length })} />
            )}

            {hasDownstream && (
              <>
                <BlastStats radius={radius} />
                {view === "tree" ? (
                  <SymbolTree radius={radius} repoFullName={repoFullName} indexedSha={indexedSha} />
                ) : (
                  <BlastGraph radius={radius} repoFullName={repoFullName} indexedSha={indexedSha} />
                )}
              </>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
