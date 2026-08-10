/* ImportPreview — the extracted draft (editable via SkillForm) + the
   ignored-entries list. Turns "nothing executable ran" from an invisible
   negative into a visible positive: the user SEES install.sh listed as
   ignored before confirming (docs/specs/skills.md, mechanism 4). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { ImportSkillPreviewResult } from "@/lib/hooks/skills";
import { SkillForm, type SkillFormValue } from "../../../SkillForm";
import { s } from "./styles";

export function ImportPreview({
  result,
  onDraftChange,
  errors,
}: {
  result: ImportSkillPreviewResult;
  onDraftChange: (draft: SkillFormValue) => void;
  /** Field-level messages from a failed confirm (POST /skills), parsed by
   *  lib/form-errors.ts from a 422 response. */
  errors?: Record<string, string>;
}) {
  const t = useTranslations("skills");
  return (
    <div>
      <div style={s.trustNotice}>{t("preview.untrustedNotice")}</div>
      <SkillForm value={result.draft} onChange={onDraftChange} errors={errors} />
      {result.ignored_entries.length > 0 && (
        <div style={s.ignoredBox}>
          <div style={s.ignoredTitle}>
            <Icon.AlertTriangle size={13} />
            {t("import.ignoredTitle")}
          </div>
          {result.ignored_entries.map((entry) => (
            <div key={entry.path} style={s.ignoredRow}>
              <span className="mono" style={s.ignoredPath}>
                {entry.path}
              </span>
              <span style={s.ignoredReason}>{entry.reason}</span>
            </div>
          ))}
        </div>
      )}
      {result.warnings.map((w) => (
        <div key={w} style={s.warning}>
          {w}
        </div>
      ))}
    </div>
  );
}
