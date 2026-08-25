/* ConfigureStep — wizard step 3: pull_request trigger chips + "Post results
   as" radio group (AC-18). Trigger changes are reported upward via
   `onToggleTrigger` — the container debounces and re-requests the server
   preview (AC-19/D-C1); this step never generates YAML itself. Clearing all
   triggers disables Continue with a reason (AC-20/EC-5). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Chip } from "@devdigest/ui";
import type { PostAs } from "./types";
import { s } from "./styles";

const TRIGGERS = ["opened", "synchronize", "reopened"] as const;
const POST_AS_OPTIONS: { id: PostAs; labelKey: string; recommended?: boolean }[] = [
  { id: "github_review", labelKey: "postAs.githubReview", recommended: true },
  { id: "pr_comment", labelKey: "postAs.prComment" },
  { id: "none", labelKey: "postAs.none" },
];

export interface ConfigureStepProps {
  triggers: string[];
  onToggleTrigger: (trigger: string) => void;
  postAs: PostAs;
  onChangePostAs: (postAs: PostAs) => void;
  onBack: () => void;
  onContinue: () => void;
}

export function ConfigureStep({
  triggers,
  onToggleTrigger,
  postAs,
  onChangePostAs,
  onBack,
  onContinue,
}: ConfigureStepProps) {
  const tCi = useTranslations("ci");
  const t = (key: string) => tCi(`exportWizard.${key}`);
  const canContinue = triggers.length > 0;

  return (
    <div>
      <div style={s.body}>
        <div>
          <div style={s.fieldLabel}>{t("triggerLabel")}</div>
          <div style={s.chipRow}>
            {TRIGGERS.map((trigger) => (
              <Chip key={trigger} active={triggers.includes(trigger)} onClick={() => onToggleTrigger(trigger)}>
                {t(`triggers.${trigger}`)}
              </Chip>
            ))}
          </div>
        </div>

        <div role="radiogroup" aria-label={t("postResultsLabel")}>
          <div style={s.fieldLabel}>{t("postResultsLabel")}</div>
          <div style={s.radioGroup}>
            {POST_AS_OPTIONS.map((opt) => (
              <label key={opt.id} style={s.radioRow}>
                <input
                  type="radio"
                  name="post-as"
                  value={opt.id}
                  checked={postAs === opt.id}
                  onChange={() => onChangePostAs(opt.id)}
                />
                {t(opt.labelKey)}
                {opt.recommended && <span style={s.reason}>({t("recommended")})</span>}
              </label>
            ))}
          </div>
        </div>

        <div role="note" style={s.callout}>
          {t("blockMergeDesc")}
        </div>
      </div>

      <div style={s.footer}>
        <Button kind="ghost" icon="ChevronLeft" onClick={onBack}>
          {t("back")}
        </Button>
        <div style={s.footerRight}>
          {!canContinue && <span style={s.reason}>{t("allTriggersOffReason")}</span>}
          <Button kind="primary" iconRight="ArrowRight" onClick={onContinue} disabled={!canContinue}>
            {t("continue")}
          </Button>
        </div>
      </div>
    </div>
  );
}
