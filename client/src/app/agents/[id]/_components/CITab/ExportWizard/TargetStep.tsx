/* TargetStep — wizard step 1: pick the CI target platform + the repo to
   deploy to. GitHub Actions is the only functional target this iteration
   (scope #1) — the other three cards render `aria-disabled` with a "coming
   soon" reason (AC-14, EC-3, NFR-3), never a native `disabled` attribute, so
   the reason text stays in the accessibility tree. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Badge, FormField, SelectInput } from "@devdigest/ui";
import type { CiTarget } from "@devdigest/shared";
import { useRepos } from "@/lib/hooks/core";
import { s } from "./styles";

const TARGETS: { id: CiTarget; label: string; desc: string; enabled: boolean }[] = [
  { id: "gha", label: "targets.gha", desc: "targets.ghaDesc", enabled: true },
  { id: "circle", label: "targets.circle", desc: "targets.circleDesc", enabled: false },
  { id: "jenkins", label: "targets.jenkins", desc: "targets.jenkinsDesc", enabled: false },
  { id: "cli", label: "targets.cli", desc: "targets.cliDesc", enabled: false },
];

export interface TargetStepProps {
  target: CiTarget;
  onSelectTarget: (target: CiTarget) => void;
  repo: string;
  onRepoChange: (repo: string) => void;
  onContinue: () => void;
}

export function TargetStep({ target, onSelectTarget, repo, onRepoChange, onContinue }: TargetStepProps) {
  const tCi = useTranslations("ci");
  const t = (key: string) => tCi(`exportWizard.${key}`);
  const { data: repos, isLoading: reposLoading } = useRepos();
  const repoList = repos ?? [];
  const noRepos = !reposLoading && repoList.length === 0;
  // Only repos integrated into DevDigest (the ones we can run reviews on) are
  // selectable targets. Leading empty option keeps the field unset until the
  // user picks one, so `canContinue` stays false.
  const repoOptions = [
    { value: "", label: t("repoPlaceholder") },
    ...repoList.map((r) => ({ value: r.full_name, label: r.full_name })),
  ];
  const canContinue = target === "gha" && repo.trim().length > 0;

  return (
    <div>
      <div style={s.body}>
        <div style={s.targetGrid}>
          {TARGETS.map((tg) => {
            const selected = target === tg.id;
            return (
              <button
                key={tg.id}
                type="button"
                aria-disabled={!tg.enabled}
                aria-pressed={tg.enabled ? selected : undefined}
                onClick={() => {
                  if (tg.enabled) onSelectTarget(tg.id);
                }}
                style={{
                  ...s.targetCard,
                  ...(selected && tg.enabled ? s.targetCardSelected : {}),
                  ...(tg.enabled ? {} : s.targetCardDisabled),
                }}
              >
                <div style={s.targetCardHeader}>
                  <span style={s.targetCardLabel}>{t(tg.label)}</span>
                  {tg.id === "gha" && <Badge color="var(--accent)" bg="var(--accent-bg)">{t("recommended")}</Badge>}
                </div>
                <div style={s.targetCardDesc}>{t(tg.desc)}</div>
                {!tg.enabled && <div style={s.targetCardComingSoon}>{t("targets.comingSoon")}</div>}
              </button>
            );
          })}
        </div>

        <FormField label={t("repoLabel")} hint={t("repoHint")}>
          <SelectInput
            value={repo}
            onChange={onRepoChange}
            options={repoOptions}
            invalid={noRepos}
          />
          {noRepos && <div style={s.repoNone}>{t("repoNone")}</div>}
        </FormField>
      </div>

      <div style={s.footer}>
        <span style={s.reason}>{!canContinue ? t("targets.repoRequired") : null}</span>
        <div style={s.footerRight}>
          <Button kind="primary" iconRight="ArrowRight" onClick={onContinue} disabled={!canContinue}>
            {t("continue")}
          </Button>
        </div>
      </div>
    </div>
  );
}
