/* /conventions — detect a connected repo's coding conventions and turn
   accepted ones into a Skill. Top-level route (not nested under /skills or
   /repos/:repoId) — the active repo comes from `useActiveRepo()`, matching
   the existing `activeKeyFor` mapping in app-shell/helpers.ts. Detection runs
   as a background job; `useConventions` self-polls while a scan is running. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { useConventions, useRescanConventions, useResetAcceptedConventions } from "@/lib/hooks/conventions";
import { useRepoIntelStatus } from "@/lib/hooks/repo-intel";
import { ConventionCard } from "../ConventionCard";
import { CreateSkillFromConventionsModal } from "../CreateSkillFromConventionsModal";
import { relativeTime } from "./helpers";
import { s } from "./styles";

export function ConventionsListView() {
  const t = useTranslations("conventions");
  const { repoId, activeRepo, reposLoaded } = useActiveRepo();
  const repoIdInvalid = useRepoNotFound(repoId);
  const { data, isLoading, isError, refetch } = useConventions(repoId);
  // Evidence links deep-link to GitHub at the repo's last-indexed commit —
  // that's the sha detection actually read the sample files from. If the repo
  // is reindexed after a scan, older candidates' line numbers can drift from
  // that sha; there's no per-scan sha stored to pin against instead.
  const { data: indexState } = useRepoIntelStatus(repoId);
  const rescan = useRescanConventions();
  const resetAccepted = useResetAcceptedConventions();
  const [modalOpen, setModalOpen] = React.useState(false);

  const conventions = data?.conventions ?? [];
  const latestScan = data?.latest_scan ?? null;
  const scanning = latestScan?.status === "running";
  // "Selected for merge" IS "accepted" — no separate selection state. The
  // Accept button's blue highlight on each card is the only signal, and
  // "Deselect all" bulk-reverts accepted→pending server-side instead of
  // toggling a hidden local Set (see ConventionCard for the same reasoning).
  const acceptedIds = conventions.filter((c) => c.status === "accepted").map((c) => c.id);

  const showNoRepo = reposLoaded && (!repoId || repoIdInvalid);
  const crumb = [{ label: t("page.crumbLab") }, { label: t("page.crumbConventions") }];

  if (showNoRepo) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  const repoName = activeRepo?.full_name ?? t("page.repoFallback");

  return (
    <AppShell crumb={crumb}>
      {modalOpen && (
        <CreateSkillFromConventionsModal
          repoName={repoName}
          conventionIds={acceptedIds}
          onClose={() => setModalOpen(false)}
          onCreated={() => setModalOpen(false)}
        />
      )}
      <div style={s.wrap}>
        <div style={s.headerRow}>
          <div>
            <h1 style={s.h1}>{t("page.headingPrefix") + repoName}</h1>
            <p style={s.subtitle}>
              {latestScan
                ? t("page.detectedFrom", {
                    count: latestScan.sample_file_count,
                    time: relativeTime(latestScan.started_at),
                  })
                : t("page.neverScanned")}
            </p>
          </div>
          <Button
            kind="secondary"
            icon="RefreshCw"
            onClick={() => repoId && rescan.mutate(repoId)}
            disabled={!repoId || scanning}
            loading={scanning}
          >
            {scanning ? t("page.scanning") : t("page.rescan")}
          </Button>
        </div>

        {conventions.length > 0 && (
          <div style={s.bulkBar}>
            <Button
              kind="ghost"
              size="sm"
              disabled={acceptedIds.length === 0 || resetAccepted.isPending}
              onClick={() => repoId && resetAccepted.mutate(repoId)}
            >
              {t("page.deselectAll")}
            </Button>
            <span style={s.bulkCount}>
              {t("page.acceptedOf", { accepted: acceptedIds.length, total: conventions.length })}
            </span>
            <Button
              kind="primary"
              icon="Sparkles"
              disabled={acceptedIds.length === 0}
              onClick={() => setModalOpen(true)}
            >
              {t("page.createSkill")}
            </Button>
          </div>
        )}

        <div style={s.list}>
          {isLoading && (
            <>
              <Skeleton height={140} />
              <Skeleton height={140} />
            </>
          )}
          {isError && <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />}
          {!isLoading && !isError && conventions.length === 0 && (
            <EmptyState
              icon="ListChecks"
              title={t("page.empty.title")}
              body={t("page.empty.body")}
              cta={t("page.empty.cta")}
              onCta={() => repoId && rescan.mutate(repoId)}
              ctaLoading={scanning}
            />
          )}
          {repoId &&
            conventions.map((c) => (
              <ConventionCard
                key={c.id}
                convention={c}
                repoId={repoId}
                repoFullName={activeRepo?.full_name}
                headSha={indexState?.lastIndexedSha}
              />
            ))}
        </div>
      </div>
    </AppShell>
  );
}
