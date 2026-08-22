/* ContextTab — an agent's Project Context attachments (SPEC-02 AC-14). Own
   attachments are settable here; documents inherited through an enabled
   skill (`source:'skill'`, already resolved server-side by the same
   `resolveContextDocs` the run uses — SPEC-01 §2 п.2) are shown read-only,
   with no detach control (AC-32/AC-33). No local optimistic state: a failed
   mutation leaves the UI exactly as the last successful query response
   rendered it (the global mutation-error toast in `lib/providers.tsx`
   surfaces the failure) — same "derive, don't store" shape as `SkillsTab`. */
"use client";

import { useTranslations } from "next-intl";
import { ErrorState, Skeleton } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { ContextDocPicker } from "@/components/context-doc-picker";
import { useAgentContextDocs, useContextDocs, useSetAgentContextDocs } from "@/lib/hooks";
import { useActiveRepo } from "@/lib/repo-context";
import { s } from "./styles";

export function ContextTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const { repoId } = useActiveRepo();

  const docsQuery = useContextDocs(repoId);
  const linksQuery = useAgentContextDocs(agent.id);
  const setDocs = useSetAgentContextDocs();

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
      <div style={s.hint}>{t("context.orderHint")}</div>
      <ContextDocPicker
        repoId={repoId}
        links={linksQuery.data}
        docs={docsQuery.data.docs}
        onChange={(paths) => setDocs.mutate({ agentId: agent.id, repoId, paths })}
        isPending={setDocs.isPending}
        variant="agent"
      />
    </div>
  );
}
