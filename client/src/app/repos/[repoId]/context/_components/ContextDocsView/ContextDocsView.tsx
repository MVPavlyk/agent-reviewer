/* ContextDocsView — /repos/:repoId/context (SPEC-02). Read-only: the toolbar
   carries only a refresh action, there is no create/upload/rename/delete/edit
   anywhere on this screen (AC-9) — attaching docs to an agent/skill happens on
   their own Context tab (Кроки 12-13), never here. Two-pane layout mirroring
   /skills: a fixed-width list column + a flex preview pane, selection owned by
   the URL (`?doc=<path>`), same pattern as `?skill=` on SkillsListView. */
"use client";

import React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, Button, EmptyState, ErrorState, Markdown, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useActiveRepo } from "@/lib/repo-context";
import {
  useContextDocContent,
  useContextDocs,
  useRefreshContextDocs,
  useRefreshRepo,
} from "@/lib/hooks";
import { ApiError } from "@/lib/api";
import { SKELETON_ROWS } from "./constants";
import { s } from "./styles";

export function ContextDocsView() {
  const t = useTranslations("context");
  const params = useParams<{ repoId: string }>();
  const repoId = params.repoId;
  const router = useRouter();
  const search = useSearchParams();
  const { activeRepo } = useActiveRepo();

  const { data, isLoading, isError, error, refetch } = useContextDocs(repoId);
  const refresh = useRefreshContextDocs();
  const refreshRepo = useRefreshRepo();

  const selectedPath = search.get("doc");
  const { data: content } = useContextDocContent(repoId, selectedPath);

  const setSelectedPath = (path: string) => {
    const sp = new URLSearchParams(search.toString());
    sp.set("doc", path);
    router.replace(`/repos/${repoId}/context?${sp.toString()}`);
  };

  const repoName = activeRepo?.full_name ?? repoId;
  const cloneMissing =
    isError && error instanceof ApiError && error.status === 409 && error.code === "clone_missing";

  return (
    <AppShell crumb={[{ label: repoName, mono: true }, { label: t("docs.crumb") }]}>
      <div style={s.wrap}>
        <div style={s.listCol}>
          <div style={s.listColHead}>
            <div style={s.headerRow}>
              <h1 style={s.h1}>{t("docs.title")}</h1>
              <Button
                kind="secondary"
                size="sm"
                icon="RefreshCw"
                loading={refresh.isPending}
                disabled={refresh.isPending}
                onClick={() => refresh.mutate(repoId)}
              >
                {t("docs.refresh")}
              </Button>
            </div>
          </div>
          <div style={s.listBody}>
            {isLoading ? (
              Array.from({ length: SKELETON_ROWS }).map((_, i) => <Skeleton key={i} height={44} />)
            ) : cloneMissing ? (
              <EmptyState
                icon="GitBranch"
                title={t("docs.cloneMissing.title")}
                body={t("docs.cloneMissing.body")}
                cta={t("docs.cloneMissing.action")}
                onCta={() => refreshRepo.mutate(repoId)}
                ctaLoading={refreshRepo.isPending}
              />
            ) : isError ? (
              <ErrorState
                title={t("docs.error.title")}
                body={error instanceof ApiError ? error.message : undefined}
                onRetry={() => refetch()}
              />
            ) : (data?.docs.length ?? 0) === 0 ? (
              <EmptyState
                icon="FileText"
                title={t("docs.empty.title")}
                body={t("docs.empty.body", { roots: (data?.roots ?? []).join(", ") })}
              />
            ) : (
              data!.docs.map((doc) => (
                <button
                  key={doc.path}
                  type="button"
                  onClick={() => setSelectedPath(doc.path)}
                  style={s.row(doc.path === selectedPath)}
                >
                  <span style={s.rowPath} title={doc.path}>
                    {doc.path}
                  </span>
                  <span style={s.rowMeta}>
                    <Badge mono>{doc.dir_type}</Badge>
                    <span style={s.usedBy}>{t("docs.usedByAgents", { count: doc.used_by_agents })}</span>
                  </span>
                </button>
              ))
            )}
          </div>
          {data && !isError && (
            <div style={s.footer}>
              {t("docs.footer", {
                count: data.docs.length,
                scannedAt: new Date(data.scanned_at).toLocaleString(),
              })}
            </div>
          )}
        </div>
        <div style={s.previewCol}>
          {selectedPath ? (
            <div style={s.previewBody}>
              {content?.truncated && <div style={s.truncatedNote}>{t("docs.truncated")}</div>}
              <Markdown>{content?.content}</Markdown>
            </div>
          ) : (
            <div style={s.selectPrompt}>
              <div style={s.selectPromptTitle}>{t("docs.selectPrompt.title")}</div>
              <div style={s.selectPromptBody}>{t("docs.selectPrompt.body")}</div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
