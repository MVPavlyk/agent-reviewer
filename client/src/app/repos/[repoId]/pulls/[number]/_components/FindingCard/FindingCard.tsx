/* FindingCard — ported from findings.jsx (createElement → TSX).
   Severity icon+label, category, file:line, confidence, markdown rationale +
   suggestion, accept/dismiss actions. Accept/dismiss reflect persisted
   timestamps. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Icon,
  SeverityBadge,
  CategoryTag,
  MonoLink,
  ConfidenceNum,
  Button,
  Markdown,
  type Severity,
  type Category,
} from "@devdigest/ui";
import type { FindingRecord, FindingActionKind } from "@devdigest/shared";
import { useCreateEvalCaseFromFinding } from "@/lib/hooks";
import { useToast } from "@/lib/toast";
import { SEV_COLOR, SEV_COLOR_FALLBACK } from "./constants";
import { lineLabel, isEligibleForEvalCase, isFindingResolved } from "./helpers";
import { githubBlobUrl } from "../../../../../../../lib/github-urls";
import { s } from "./styles";

export function FindingCard({
  f,
  focused,
  defaultExpanded,
  onAction,
  pending,
  repoFullName,
  headSha,
  reviewAgentId,
}: {
  f: FindingRecord;
  focused?: boolean;
  defaultExpanded?: boolean;
  onAction?: (action: FindingActionKind, reply?: string) => void;
  pending?: boolean;
  repoFullName?: string | null;
  headSha?: string | null;
  /** The review run's agent (`ReviewRecord.agent_id`) — `FindingRecord` has no
   *  agent of its own, so it's threaded down from ReviewRunAccordion via
   *  FindingsPanel. `null` disables "Turn into eval case" (AC-16). */
  reviewAgentId?: string | null;
}) {
  const t = useTranslations("prReview");
  const [expanded, setExpanded] = React.useState(defaultExpanded ?? false);
  const sevColor = SEV_COLOR[f.severity] ?? SEV_COLOR_FALLBACK;
  const fileHref =
    repoFullName && headSha
      ? githubBlobUrl(repoFullName, headSha, f.file, f.start_line, f.end_line)
      : undefined;
  const accepted = !!f.accepted_at;
  const dismissed = !!f.dismissed_at;
  const muted = accepted || dismissed;

  // ---- "Turn into eval case" (L-06) ----
  const createEvalCase = useCreateEvalCaseFromFinding();
  const toast = useToast();
  const [evalCaseId, setEvalCaseId] = React.useState<string | null>(null);
  const [showUnresolvedHint, setShowUnresolvedHint] = React.useState(false);
  const evalCaseEligible = isEligibleForEvalCase(f);
  const evalCaseResolved = isFindingResolved(f);

  function handleTurnIntoEvalCase() {
    if (!evalCaseResolved) {
      setShowUnresolvedHint(true);
      return;
    }
    if (reviewAgentId == null) return;
    setShowUnresolvedHint(false);
    createEvalCase.mutateAsync(f.id).then((res) => {
      setEvalCaseId(res.case_id);
      toast.success(t("finding.evalCase.toastSuccess"), {
        label: t("finding.evalCase.openInEvals"),
        href: `/agents/${reviewAgentId}?tab=evals`,
      });
    });
  }

  return (
    <div data-finding-id={f.id} style={s.card(!!focused, sevColor, muted)}>
      <div onClick={() => setExpanded((e) => !e)} style={s.header}>
        <div style={s.badgeWrap}>
          <SeverityBadge severity={f.severity as Severity} compact />
        </div>
        <div style={s.headerMain}>
          <div style={s.titleRow}>
            <span style={s.title(muted, dismissed)}>{f.title}</span>
            <CategoryTag category={f.category as Category} />
            {accepted && <span style={s.acceptedTag}>{t("finding.accepted")}</span>}
            {dismissed && <span style={s.dismissedTag}>{t("finding.dismissed")}</span>}
          </div>
          <div style={s.metaRow}>
            <MonoLink href={fileHref}>
              {f.file}:{lineLabel(f)}
            </MonoLink>
            <ConfidenceNum value={f.confidence} />
          </div>
        </div>
        <Icon.ChevronDown size={16} style={s.chevron(expanded)} />
      </div>

      {expanded && (
        <div style={s.body}>
          <div style={s.prose}>
            <Markdown>{f.rationale}</Markdown>
          </div>
          {f.suggestion && (
            <div style={s.suggestionWrap}>
              <div style={s.suggestionLabel}>{t("finding.suggestedFix")}</div>
              <div style={s.prose}>
                <Markdown>{f.suggestion}</Markdown>
              </div>
            </div>
          )}

          <div style={s.actions}>
            <Button
              kind="secondary"
              size="sm"
              icon="Check"
              disabled={pending}
              active={accepted}
              onClick={() => onAction?.("accept")}
            >
              {t("finding.accept")}
            </Button>
            <Button
              kind="ghost"
              size="sm"
              icon="X"
              disabled={pending}
              active={dismissed}
              onClick={() => onAction?.("dismiss")}
            >
              {t("finding.dismiss")}
            </Button>
            {evalCaseEligible && (
              <Button
                kind="ghost"
                size="sm"
                icon="FlaskConical"
                disabled={reviewAgentId == null || createEvalCase.isPending}
                aria-label={t("finding.evalCase.button")}
                title={reviewAgentId == null ? t("finding.evalCase.disabledHint") : undefined}
                onClick={handleTurnIntoEvalCase}
              >
                {t("finding.evalCase.button")}
              </Button>
            )}
          </div>
          {showUnresolvedHint && <div style={s.evalCaseHint}>{t("finding.evalCase.unresolvedHint")}</div>}
          {evalCaseId && (
            <div style={s.evalCaseHint}>
              <a href={`/agents/${reviewAgentId}?tab=evals`}>{t("finding.evalCase.created")}</a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
