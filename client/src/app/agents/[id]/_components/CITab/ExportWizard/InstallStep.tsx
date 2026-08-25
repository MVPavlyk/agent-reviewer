/* InstallStep — wizard step 4: two FUNCTIONAL install cards (ADDENDUM v2
   decision 1 — "Open a PR" is no longer a disabled stub). "Open a PR" calls
   `useExportCi` with `action:'open_pr'` and opens a real PR; "Copy files as
   a zip" downloads the bundle (`action:'files'`). Install is disabled while
   pending (AC-25) and shows a retry affordance on error without closing the
   wizard (AC-26/EC-8). On success, a success view surfaces the PR link
   and/or the once-only ingest token (never persisted client-side) before
   the user closes the wizard via Done. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon } from "@devdigest/ui";
import type { InstallOption, InstallResult } from "./types";
import { s } from "./styles";

export interface InstallStepProps {
  repo: string;
  fileCount: number;
  installOption: InstallOption;
  onChangeInstallOption: (option: InstallOption) => void;
  onBack: () => void;
  onInstall: () => void;
  isPending: boolean;
  isError: boolean;
  result: InstallResult | null;
  onDone: () => void;
}

export function InstallStep({
  repo,
  fileCount,
  installOption,
  onChangeInstallOption,
  onBack,
  onInstall,
  isPending,
  isError,
  result,
  onDone,
}: InstallStepProps) {
  const tCi = useTranslations("ci");
  const t = (key: string, values?: Record<string, string | number>) => tCi(`exportWizard.${key}`, values);

  if (result) {
    const isPr = result.prUrl !== null;
    return (
      <div>
        <div style={s.body}>
          <div style={s.successBox}>
            <Icon.CheckCircle size={16} />
            <span style={s.successTitle}>{isPr ? t("prOpenedTitle") : t("filesDownloadedTitle")}</span>
            <div style={s.successBody}>
              {isPr
                ? t("prOpenedBody", { repo: repo || t("ownerRepo") })
                : t("filesDownloadedBody", { repo: repo || t("ownerRepo") })}
            </div>
            {isPr && (
              <a href={result.prUrl ?? undefined} target="_blank" rel="noreferrer">
                {t("viewPr")}
              </a>
            )}
          </div>

          {result.ingestToken && (
            <div style={s.tokenBox}>
              <span style={s.successTitle}>{t("ingestTokenTitle")}</span>
              <div style={s.successBody}>
                {t("ingestTokenBody", { key: t("ingestTokenKey"), repo: repo || t("ownerRepo") })}
              </div>
              <code style={s.tokenValue}>{result.ingestToken}</code>
            </div>
          )}

          {/* Checklist of what the target repo still needs before the
              workflow can actually run — a missing OPENROUTER_API_KEY is the
              #1 cause of a first-run 401 (the LLM call fails), and it's easy
              to forget when the wizard itself never touches the secret. */}
          <div style={s.checklistBox}>
            <span style={s.successTitle}>{t("checklistTitle")}</span>
            <ul style={s.checklist}>
              <li>{t("checklistApiKey")}</li>
              {result.ingestToken && <li>{t("checklistIngestToken")}</li>}
              <li>{t("checklistMerge")}</li>
            </ul>
          </div>
        </div>

        <div style={s.footer}>
          <div />
          <div style={s.footerRight}>
            <Button kind="primary" icon="Check" onClick={onDone}>
              {t("done")}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={s.body}>
        <div style={s.installCards}>
          <button
            type="button"
            aria-pressed={installOption === "open_pr"}
            onClick={() => onChangeInstallOption("open_pr")}
            style={{
              ...s.installCard,
              ...(installOption === "open_pr" ? s.installCardSelected : {}),
            }}
          >
            <div style={s.installCardHeader}>
              <span style={s.installCardTitle}>{t("installCardTitle")}</span>
              <span style={s.reason}>{t("recommended")}</span>
            </div>
            <div style={s.installCardBody}>
              {t("installCardBody", { repo: repo || t("ownerRepo"), count: fileCount })}
            </div>
          </button>

          <button
            type="button"
            aria-pressed={installOption === "files"}
            onClick={() => onChangeInstallOption("files")}
            style={{
              ...s.installCard,
              ...(installOption === "files" ? s.installCardSelected : {}),
            }}
          >
            <div style={s.installCardHeader}>
              <span style={s.installCardTitle}>{t("zipCardTitle")}</span>
              <span style={s.reason}>{t("zipCardHint")}</span>
            </div>
            <div style={s.installCardBody}>{t("zipCardBody")}</div>
          </button>
        </div>

        {isError && (
          <div role="alert" style={s.installErrorBox}>
            <Icon.AlertOctagon size={14} />
            <span>{t("installError")}</span>
          </div>
        )}
      </div>

      <div style={s.footer}>
        <Button kind="ghost" icon="ChevronLeft" onClick={onBack} disabled={isPending}>
          {t("back")}
        </Button>
        <div style={s.footerRight}>
          <Button
            kind="primary"
            icon={isError ? "RefreshCw" : "Check"}
            loading={isPending}
            disabled={isPending}
            onClick={onInstall}
          >
            {isPending ? t("installing") : isError ? t("retry") : t("install")}
          </Button>
        </div>
      </div>
    </div>
  );
}
