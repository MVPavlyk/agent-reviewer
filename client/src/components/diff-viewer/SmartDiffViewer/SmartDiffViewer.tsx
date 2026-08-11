/* SmartDiffViewer — groups a PR's changed files into core / wiring /
   boilerplate sections (the SmartDiff contract, computed server-side without
   an LLM call) instead of the flat file list DiffViewer renders. Purely
   presentational: all data (smartDiff + files + per-line severity) arrives
   as props from DiffTab, which owns the fetching. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { SmartDiff, SmartDiffFile, SmartDiffRole, Severity } from "@devdigest/shared";
import type { PrFile } from "@/lib/types";
import { type DiffCommentApi } from "../comments";
import { s, roleDotFor } from "../styles";
import { SMART_DIFF_ROLE_META, SMART_DIFF_ROLE_ORDER } from "../constants";
import { FileCard } from "../FileCard";

/** Core files, and any file with at least one finding, start expanded;
 *  boilerplate always starts collapsed regardless of findings. */
function shouldDefaultOpen(role: SmartDiffRole, file: SmartDiffFile): boolean {
  if (role === "boilerplate") return false;
  return role === "core" || file.finding_lines.length > 0;
}

function SmartDiffGroupSection({
  role,
  files,
  fileByPath,
  severityByFileLine,
  commenting,
  onFindingsClick,
}: {
  role: SmartDiffRole;
  files: SmartDiffFile[];
  fileByPath: Map<string, PrFile>;
  severityByFileLine?: Map<string, Map<number, Severity>>;
  commenting?: DiffCommentApi;
  onFindingsClick?: (path: string, line: number) => void;
}) {
  const t = useTranslations("shell");
  const meta = SMART_DIFF_ROLE_META[role];

  return (
    <div style={s.roleSection}>
      <div style={s.roleHeader}>
        <span style={roleDotFor(meta.color)} />
        <span style={s.roleLabel}>{t(meta.labelKey)}</span>
        <span style={s.roleHint}>{t(meta.hintKey)}</span>
        <span style={s.roleCount}>{files.length}</span>
      </div>
      <div style={s.list}>
        {files.map((file) => {
          const prFile = fileByPath.get(file.path);
          if (!prFile) return null;
          const firstFindingLine = file.finding_lines[0];
          return (
            <FileCard
              key={file.path}
              file={prFile}
              commenting={commenting}
              defaultOpen={shouldDefaultOpen(role, file)}
              findingCount={file.finding_lines.length}
              summary={file.pseudocode_summary}
              severityByLine={severityByFileLine?.get(file.path)}
              onFindingsClick={
                onFindingsClick && firstFindingLine != null
                  ? () => onFindingsClick(file.path, firstFindingLine)
                  : undefined
              }
            />
          );
        })}
      </div>
    </div>
  );
}

export function SmartDiffViewer({
  smartDiff,
  files,
  severityByFileLine,
  commenting,
  onFindingsClick,
}: {
  smartDiff: SmartDiff;
  files: PrFile[];
  /** file path → (new-file line number → severity), from the latest review. */
  severityByFileLine?: Map<string, Map<number, Severity>>;
  commenting?: DiffCommentApi;
  /** Fired when a file's "N findings" badge is clicked, with its first
   *  finding line — DiffTab uses this to scroll the diff into view. */
  onFindingsClick?: (path: string, line: number) => void;
}) {
  const t = useTranslations("shell");
  const fileByPath = React.useMemo(() => {
    const m = new Map<string, PrFile>();
    for (const f of files) m.set(f.path, f);
    return m;
  }, [files]);

  const groupByRole = React.useMemo(() => {
    const m = new Map<SmartDiffRole, SmartDiffFile[]>();
    for (const g of smartDiff.groups) m.set(g.role, g.files);
    return m;
  }, [smartDiff]);

  const nonEmptyRoles = SMART_DIFF_ROLE_ORDER.filter((role) => (groupByRole.get(role)?.length ?? 0) > 0);

  if (nonEmptyRoles.length === 0) {
    return <div style={s.empty}>{t("diffViewer.noChangedFiles")}</div>;
  }

  return (
    <div style={s.list}>
      {nonEmptyRoles.map((role) => (
        <SmartDiffGroupSection
          key={role}
          role={role}
          files={groupByRole.get(role) ?? []}
          fileByPath={fileByPath}
          severityByFileLine={severityByFileLine}
          commenting={commenting}
          onFindingsClick={onFindingsClick}
        />
      ))}
    </div>
  );
}
