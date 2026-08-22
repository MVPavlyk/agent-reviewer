/* ContextDocPicker — the SPEC-02 AC-28 shared list: attach/detach + reorder
   a set of Project Context documents. Used by BOTH the agent Context tab
   (`variant:'agent'`, own attachments interleaved with `source:'skill'`
   inherited rows that have no detach control, AC-32/AC-33) and the skill
   Context tab (`variant:'skill'`, no inherited rows ever appear). One
   component, one import path (`@/components/context-doc-picker`) — do not
   fork this into two copies. Reordering is ArrowUp/ArrowDown IconBtns, no
   DnD library (SPEC-02 N-3), mirroring `SkillsTab`. No token-budget
   threshold anywhere in this file — that's out of scope by design (AC-22). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { IconBtn, Toggle } from "@devdigest/ui";
import type { ContextDoc, ContextDocLink } from "@/lib/types";
import { useContextDocContent, useRepos } from "@/lib/hooks";
import { ContextDocRow } from "./ContextDocRow";
import { EMPTY_QUERY } from "./constants";
import { basename, filterDocs, moveItem, sumActiveTokens } from "./helpers";
import { s } from "./styles";

export function ContextDocPicker({
  repoId,
  links,
  docs,
  onChange,
  isPending,
  variant,
}: {
  repoId: string;
  links: ContextDocLink[];
  docs: ContextDoc[];
  /** Full ordered array of the entity's OWN attachment paths (inherited
   *  `source:'skill'` rows are never included — they aren't settable here). */
  onChange: (paths: string[]) => void;
  isPending: boolean;
  variant: "agent" | "skill";
}) {
  const t = useTranslations("context");
  const [query, setQuery] = React.useState(EMPTY_QUERY);
  const [previewPath, setPreviewPath] = React.useState<string | null>(null);

  const { data: repos } = useRepos();
  const { data: previewData, isLoading: previewLoading } = useContextDocContent(repoId, previewPath);

  const docsByPath = React.useMemo(() => new Map(docs.map((d) => [d.path, d])), [docs]);
  const attachedPaths = React.useMemo(() => new Set(links.map((l) => l.path)), [links]);
  // `source: 'agent'` means "a direct attachment by the resource's own
  // owner", NOT literally "attached to an agent" — see the contract's
  // docblock (`vendor/shared/contracts/context-docs.ts`). For the skill
  // variant every row IS `'agent'` (a skill's own list has no inherited
  // concept), so this filter still correctly keeps them all as "own".
  const ownPaths = React.useMemo(
    () => links.filter((l) => l.source === "agent").map((l) => l.path),
    [links],
  );
  const attachable = filterDocs(
    docs.filter((d) => !attachedPaths.has(d.path)),
    query,
  );
  const tokens = sumActiveTokens(links, docs);
  const currentRepo = repos?.find((r) => r.id === repoId);
  const showMultiRepoWarning = (repos?.length ?? 0) > 1;

  const apply = (paths: string[]) => onChange(paths);
  const detach = (path: string) => apply(ownPaths.filter((p) => p !== path));
  const attach = (path: string) => apply([...ownPaths, path]);
  const move = (from: number, to: number) => apply(moveItem(ownPaths, from, to));

  const togglePreview = (path: string) => setPreviewPath((cur) => (cur === path ? null : path));

  return (
    <div style={s.wrap} data-variant={variant}>
      <div style={s.header}>
        <span style={s.count}>{t("picker.attachedCount", { linked: links.length, total: docs.length })}</span>
      </div>
      <div style={s.hint}>{t("picker.orderHint")}</div>

      {showMultiRepoWarning && (
        <div role="alert" style={s.warning}>
          {t("picker.multiRepoWarning", { repo: currentRepo?.full_name ?? repoId })}
        </div>
      )}

      {links.length > 0 && (
        <div style={s.linkedList}>
          {links.map((link) => {
            const doc = docsByPath.get(link.path);
            const isOwn = link.source === "agent";
            const ownIdx = isOwn ? ownPaths.indexOf(link.path) : -1;
            return (
              <ContextDocRow
                key={link.path}
                path={link.path}
                doc={doc}
                sourceLabel={link.source === "skill" ? link.skill_name : undefined}
                previewing={previewPath === link.path}
                onTogglePreview={() => togglePreview(link.path)}
                previewContent={previewData?.content}
                previewTruncated={previewData?.truncated}
                previewLoading={previewLoading && previewPath === link.path}
                right={
                  isOwn ? (
                    <div style={s.rowActions}>
                      <IconBtn
                        icon="ArrowUp"
                        label={t("picker.moveUp")}
                        size={24}
                        onClick={() => move(ownIdx, ownIdx - 1)}
                        disabled={ownIdx === 0 || isPending}
                      />
                      <IconBtn
                        icon="ArrowDown"
                        label={t("picker.moveDown")}
                        size={24}
                        onClick={() => move(ownIdx, ownIdx + 1)}
                        disabled={ownIdx === ownPaths.length - 1 || isPending}
                      />
                      <Toggle
                        on
                        onChange={() => detach(link.path)}
                        size={13}
                        label={t("picker.attachedToggle", { path: basename(link.path) })}
                        disabled={isPending}
                      />
                    </div>
                  ) : undefined
                }
              />
            );
          })}
        </div>
      )}

      <div style={s.sectionLabel}>{t("picker.attachSectionLabel")}</div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("picker.filterPlaceholder")}
        style={s.filterInput}
        aria-label={t("picker.filterPlaceholder")}
      />
      <div style={s.attachList}>
        {attachable.length === 0 && (
          <div style={s.empty}>{query ? t("picker.noMatches") : t("picker.nothingToAttach")}</div>
        )}
        {attachable.map((doc) => (
          <ContextDocRow
            key={doc.path}
            path={doc.path}
            doc={doc}
            previewing={previewPath === doc.path}
            onTogglePreview={() => togglePreview(doc.path)}
            previewContent={previewData?.content}
            previewTruncated={previewData?.truncated}
            previewLoading={previewLoading && previewPath === doc.path}
            right={
              <Toggle
                on={false}
                onChange={() => attach(doc.path)}
                size={13}
                label={t("picker.attachedToggle", { path: basename(doc.path) })}
                disabled={isPending || !!doc.excluded_reason}
              />
            }
          />
        ))}
      </div>

      <div style={s.footer}>
        {t("picker.tokensFooter", { count: tokens })}
        {currentRepo && <> {t("picker.tokensRepoCaveat", { repo: currentRepo.full_name })}</>}
      </div>
    </div>
  );
}
