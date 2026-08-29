/* ContextTab — a skill's Project Context attachments (SPEC-02 AC-27). Skills
   never have inherited rows of their own (only agents inherit, from the
   skills they use) — this tab always renders `ContextDocPicker` with
   `variant:'skill'` and no `source:'skill'` rows exist in the response, so
   every link here is the skill's own and every row is fully interactive.
   No local optimistic state, same "derive, don't store" shape as the agent
   ContextTab and `SkillsTab`: a failed mutation leaves the UI exactly as the
   last successful query response rendered it. */
"use client";

import { useTranslations } from "next-intl";
import { Badge, ErrorState, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { ContextDocPicker } from "@/components/context-doc-picker";
import { useContextDocs, useSetSkillContextDocs, useSkillContextDocs } from "@/lib/hooks";
import { useActiveRepo } from "@/lib/repo-context";
import { s } from "./styles";

export function ContextTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const { repoId } = useActiveRepo();

  const docsQuery = useContextDocs(repoId);
  const linksQuery = useSkillContextDocs(skill.id);
  const setDocs = useSetSkillContextDocs();

  const isLoading = !repoId || docsQuery.isLoading || linksQuery.isLoading;
  const isError = docsQuery.isError || linksQuery.isError;

  if (isLoading) {
    return (
      <div style={s.wrap}>
        <Skeleton height={44} />
        <Skeleton height={44} />
        <Skeleton height={44} />
      </div>
    );
  }
  if (isError || !docsQuery.data || !linksQuery.data || !repoId) {
    return (
      <div style={s.wrap}>
        <ErrorState body={t("context.loadError")} onRetry={() => { void docsQuery.refetch(); void linksQuery.refetch(); }} />
      </div>
    );
  }

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <div style={s.hint}>{t("context.hint")}</div>
        <Badge color="var(--text-muted)" mono>
          {t("context.attachedBadge", { count: linksQuery.data.length })}
        </Badge>
      </div>
      <ContextDocPicker
        repoId={repoId}
        links={linksQuery.data}
        docs={docsQuery.data.docs}
        onChange={(paths) => setDocs.mutate({ skillId: skill.id, repoId, paths })}
        isPending={setDocs.isPending}
        variant="skill"
      />
    </div>
  );
}
