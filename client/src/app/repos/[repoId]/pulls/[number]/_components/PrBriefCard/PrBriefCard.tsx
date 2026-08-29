"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Card, SectionLabel, Badge, Button, EmptyState, Skeleton, Icon } from "@devdigest/ui";
import type { Risk, ReviewFocusItem, RiskLevel } from "@devdigest/shared";
import { usePrBrief, useGenerateBrief } from "@/lib/hooks/brief";
import { githubBlobUrl } from "@/lib/github-urls";
import { RISK_LEVEL_STYLE } from "./constants";
import { s } from "./styles";

interface PrBriefCardProps {
  prId: string | null;
  /** `pr.updated_at` — compared against the brief's own snapshot to show a
   *  "this PR moved on" notice. */
  prUpdatedAt?: string | null;
  repoFullName: string | null;
  headSha?: string | null;
}

/** Last path segment — the full path always stays available via `title`
 *  (SPEC-04 AC-18: a long repo-relative path must not blow up the layout). */
function basename(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] || path;
}

/** Build the `githubBlobUrl` href for a file ref when we have enough context
 *  to link it (AC-13/AC-14/AC-15) — `null` when `repoFullName`/`headSha`
 *  aren't available, so callers fall back to plain (non-clickable) text. */
function blobHref(
  repoFullName: string | null,
  headSha: string | null | undefined,
  file: string,
  line?: number | null,
): string | null {
  if (!repoFullName || !headSha) return null;
  return githubBlobUrl(repoFullName, headSha, file, line ?? undefined);
}

function RiskItem({
  risk,
  repoFullName,
  headSha,
}: {
  risk: Risk;
  repoFullName: string | null;
  headSha?: string | null;
}) {
  const style = RISK_LEVEL_STYLE[risk.severity as RiskLevel];
  return (
    <div style={{ ...s.riskItem, borderLeftColor: style.color }}>
      <div style={s.riskHeader}>
        <span style={s.riskTitle}>{risk.title}</span>
        <Badge color={style.color} bg={style.bg} icon={style.icon}>
          {risk.severity}
        </Badge>
      </div>
      <div style={s.explanation}>{risk.explanation}</div>
      {risk.file_refs.length > 0 && (
        <div style={s.fileRefs}>
          {risk.file_refs.map((file) => {
            const href = blobHref(repoFullName, headSha, file);
            return (
              <Badge key={file} mono style={{ maxWidth: "100%" }}>
                {href ? (
                  <a href={href} target="_blank" rel="noreferrer" title={file} style={s.fileRefLink}>
                    {basename(file)}
                  </a>
                ) : (
                  <span title={file}>{basename(file)}</span>
                )}
              </Badge>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FocusItem({
  item,
  repoFullName,
  headSha,
}: {
  item: ReviewFocusItem;
  repoFullName: string | null;
  headSha?: string | null;
}) {
  const href = blobHref(repoFullName, headSha, item.file, item.line);
  // AC-13: the whole row's text is "<file>[:<line>] — <reason>", and the
  // clickable target (when linkable) is that SAME text, not just the file
  // segment — the reason is part of the link, not a sibling.
  const label = (
    <>
      {basename(item.file)}
      {item.line != null ? `:${item.line}` : ""}
      <span style={s.focusReason}> — {item.reason}</span>
    </>
  );
  return (
    <div style={s.focusItem}>
      <Icon.FileText size={13} style={{ flexShrink: 0, marginTop: 2, color: "var(--text-muted)" }} />
      {href ? (
        <a href={href} target="_blank" rel="noreferrer" style={s.focusLink} title={item.file}>
          {label}
        </a>
      ) : (
        <span title={item.file} style={s.focusLink}>
          {label}
        </span>
      )}
    </div>
  );
}

/**
 * PR Brief — a single card summarizing "how risky is this, and what should I
 * look at first" for a PR. Full-width, mounted above the Intent/Blast grid
 * on the Overview tab. Mirrors `IntentCard`'s state machine exactly:
 * skeleton → empty state (generate CTA) → error (retry) → populated.
 */
export function PrBriefCard({ prId, prUpdatedAt, repoFullName, headSha }: PrBriefCardProps) {
  const t = useTranslations("prReview");
  const { data: brief, isLoading, notFound } = usePrBrief(prId);
  const generate = useGenerateBrief(prId);

  if (!prId || (isLoading && !notFound)) {
    return (
      <div style={s.wrap}>
        <Card>
          <Skeleton height={100} />
        </Card>
      </div>
    );
  }

  if (notFound) {
    return (
      <div style={s.wrap}>
        <Card>
          <SectionLabel icon="Gauge">{t("brief.title")}</SectionLabel>
          <EmptyState
            icon="Gauge"
            title={t("brief.emptyTitle")}
            body={t("brief.emptyBody")}
            cta={t("brief.generate")}
            onCta={() => generate.mutate({})}
            ctaLoading={generate.isPending}
          />
        </Card>
      </div>
    );
  }

  if (generate.isError && !brief) {
    return (
      <div style={s.wrap}>
        <Card>
          <SectionLabel icon="Gauge">{t("brief.title")}</SectionLabel>
          <div style={s.errorBox}>
            <span>{t("brief.errorBody")}</span>
            <Button kind="secondary" size="sm" icon="RefreshCw" loading={generate.isPending} onClick={() => generate.mutate({})}>
              {t("brief.retry")}
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (!brief) return null;

  const riskStyle = RISK_LEVEL_STYLE[brief.risk_level];
  const isStale = Boolean(
    prUpdatedAt && brief.source_updated_at && new Date(prUpdatedAt) > new Date(brief.source_updated_at),
  );

  return (
    <div style={s.wrap}>
      <Card>
        <SectionLabel
          icon="Gauge"
          right={
            <Badge color={riskStyle.color} bg={riskStyle.bg} icon={riskStyle.icon}>
              {t(`brief.riskLevel.${brief.risk_level}`)}
            </Badge>
          }
        >
          {t("brief.title")}
        </SectionLabel>

        {generate.isError && (
          // AC-7/EC-3: a rejected regenerate keeps showing the previous
          // brief below — the error is a banner, not a full replacement.
          <div style={{ ...s.errorBox, marginBottom: 14 }}>
            <span>{t("brief.errorBody")}</span>
            <Button
              kind="secondary"
              size="sm"
              icon="RefreshCw"
              loading={generate.isPending}
              onClick={() => generate.mutate({})}
            >
              {t("brief.retry")}
            </Button>
          </div>
        )}

        <div style={s.section}>
          <div style={s.sectionLabel}>{t("brief.what")}</div>
          <div style={s.bodyText}>{brief.what}</div>
        </div>

        <div style={s.section}>
          <div style={s.sectionLabel}>{t("brief.why")}</div>
          <div style={s.bodyText}>{brief.why}</div>
        </div>

        <div style={s.section}>
          <div style={s.sectionLabel}>{t("brief.risksTitle")}</div>
          {brief.risks.length === 0 ? (
            <div style={s.emptyNote}>{t("brief.risksEmpty")}</div>
          ) : (
            <div style={s.riskList}>
              {brief.risks.map((risk, i) => (
                <RiskItem key={`${risk.title}-${i}`} risk={risk} repoFullName={repoFullName} headSha={headSha} />
              ))}
            </div>
          )}
        </div>

        <div style={s.section}>
          <div style={s.sectionLabel}>{t("brief.focusTitle")}</div>
          {brief.review_focus.length === 0 ? (
            <div style={s.emptyNote}>{t("brief.focusEmpty")}</div>
          ) : (
            <div style={s.focusList}>
              {brief.review_focus.map((item, i) => (
                <FocusItem key={`${item.file}-${i}`} item={item} repoFullName={repoFullName} headSha={headSha} />
              ))}
            </div>
          )}
        </div>

        {isStale && (
          <div style={s.staleNotice}>
            <Icon.Clock size={13} />
            {t("brief.staleNotice")}
          </div>
        )}

        <div style={s.footer}>
          <span style={s.generatedBy}>
            <Icon.Sparkles size={12} />
            {t("brief.generatedBy", {
              provider: brief.provider,
              model: brief.model,
              date: new Date(brief.generated_at).toLocaleString(),
            })}
          </span>
          <Button
            kind="secondary"
            size="sm"
            icon="RefreshCw"
            loading={generate.isPending}
            disabled={generate.isPending}
            onClick={() => generate.mutate({ force: true })}
          >
            {t("brief.regenerate")}
          </Button>
        </div>
      </Card>
    </div>
  );
}
