/* VersionsTab — body-snapshot history for a skill (docs/specs/skills.md
   Extension, decision E2): restore is COPY-FORWARD, never a rewrite —
   "Restore v4" when current is v5 creates v6 with v4's body. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, ErrorState, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useRestoreSkillVersion, useSkillVersions } from "@/lib/hooks/skills";
import { diffLines } from "./diff";
import { s } from "./styles";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

export function VersionsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const { data: versions, isLoading, isError, refetch } = useSkillVersions(skill.id);
  const restore = useRestoreSkillVersion();
  const [diffOpenFor, setDiffOpenFor] = React.useState<number | null>(null);

  if (isLoading) {
    return (
      <div style={s.wrap}>
        <Skeleton height={60} />
        <Skeleton height={60} />
      </div>
    );
  }
  if (isError || !versions) {
    return (
      <div style={s.wrap}>
        <ErrorState body={t("versions.loadError")} onRetry={() => refetch()} />
      </div>
    );
  }

  const nextVersion = skill.version + 1;

  const onRestore = (version: number) => {
    const msg = t("versions.restoreConfirm", { version, next: nextVersion });
    if (!window.confirm(msg)) return;
    restore.mutate({ id: skill.id, version });
  };

  return (
    <div style={s.wrap}>
      {versions.map((v) => {
        const isCurrent = v.version === skill.version;
        const diffing = diffOpenFor === v.version;
        return (
          <div key={v.version} style={s.row}>
            <div style={s.rowHeader}>
              <Badge color={isCurrent ? "var(--accent)" : "var(--text-muted)"} mono>
                {`v${v.version}`}
              </Badge>
              {isCurrent && <Badge color="var(--text-secondary)">{t("versions.current")}</Badge>}
              <span style={s.summary}>{v.change_summary || t("versions.noSummary")}</span>
              <span style={s.date}>{formatDate(v.created_at)}</span>
            </div>
            <div style={s.rowActions}>
              {!isCurrent && (
                <Button
                  kind="secondary"
                  size="sm"
                  onClick={() => setDiffOpenFor(diffing ? null : v.version)}
                >
                  {t("versions.diffTitle")}
                </Button>
              )}
              <Button
                kind="secondary"
                size="sm"
                disabled={isCurrent || restore.isPending}
                onClick={() => onRestore(v.version)}
              >
                {restore.isPending ? t("versions.restoring") : t("versions.restore")}
              </Button>
            </div>
            {diffing && !isCurrent && (
              <pre style={s.diff}>
                {diffLines(v.body, skill.body).map((line, idx) => (
                  <div key={idx} style={s.diffLine(line.type)}>
                    {line.type === "add" ? "+ " : line.type === "remove" ? "- " : "  "}
                    {line.text}
                  </div>
                ))}
              </pre>
            )}
          </div>
        );
      })}
    </div>
  );
}
