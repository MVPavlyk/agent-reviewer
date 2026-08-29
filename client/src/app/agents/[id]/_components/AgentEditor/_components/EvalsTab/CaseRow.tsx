/* CaseRow — one eval case in the Evals tab list. Status is never encoded by
   icon/color alone (NFR-10): the accessible name of the row's own <button>
   includes the status word, so `getByRole("button", { name: /failed/i })`
   finds it without relying on the glyph or its color. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { EvalCaseRecord } from "@devdigest/shared";
import { Badge } from "@devdigest/ui";
import { caseBadgeLabel, caseRunStatus, expectedGotCounts } from "./helpers";
import { s } from "./styles";

const STATUS_GLYPH: Record<ReturnType<typeof caseRunStatus>, string> = {
  passed: "✓", // ✓
  failed: "✗", // ✗
  never_run: "○", // ○
};

const STATUS_COLOR: Record<ReturnType<typeof caseRunStatus>, string> = {
  passed: "var(--ok, #1a9c5c)",
  failed: "var(--crit, #d9483a)",
  never_run: "var(--text-muted)",
};

export function CaseRow({ row, onOpen }: { row: EvalCaseRecord; onOpen: (caseId: string) => void }) {
  const t = useTranslations("agents");
  const status = caseRunStatus(row);
  const { expected, got } = expectedGotCounts(row);
  const statusLabel = t(`editor.evals.case.status.${status}`);
  const caption =
    got == null
      ? t("editor.evals.case.expectedOnly", { expected })
      : t("editor.evals.case.expectedGot", { expected, got });

  return (
    <button
      type="button"
      style={s.caseRow}
      onClick={() => onOpen(row.id)}
      aria-label={`${row.name}, ${statusLabel}, ${caption}`}
    >
      <span aria-hidden="true" style={s.caseIcon(STATUS_COLOR[status])}>
        {STATUS_GLYPH[status]}
      </span>
      <span className="mono" style={s.caseName}>
        {row.name}
      </span>
      <span style={s.caseCaption}>{caption}</span>
      <Badge>{caseBadgeLabel(row)}</Badge>
    </button>
  );
}
