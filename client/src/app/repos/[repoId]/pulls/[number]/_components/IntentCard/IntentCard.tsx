"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Card, SectionLabel, Badge, Button, EmptyState, Skeleton, Icon } from "@devdigest/ui";
import { usePrIntent, useClassifyIntent } from "@/lib/hooks/reviews";
import { SOURCE_ORDER, SOURCE_ICON } from "./constants";
import { s } from "./styles";

interface IntentCardProps {
  prId: string | null;
  /** `pr.updated_at` — compared against the intent's own snapshot to show a
   *  "this PR moved on" notice. */
  prUpdatedAt?: string | null;
}

/**
 * Intent Layer — renders the PR's classified intent & scope, or an empty
 * state with a "Classify intent" CTA when none exists yet. Mounted between
 * `PrDetailHeader` and the tab content on the PR detail page so it's visible
 * above the review results on every tab.
 */
export function IntentCard({ prId, prUpdatedAt }: IntentCardProps) {
  const t = useTranslations("prReview");
  const { data: intent, isLoading, notFound } = usePrIntent(prId);
  const classify = useClassifyIntent(prId);

  if (!prId || (isLoading && !notFound)) {
    return (
      <div style={s.wrap}>
        <Card>
          <Skeleton height={80} />
        </Card>
      </div>
    );
  }

  if (notFound) {
    return (
      <div style={s.wrap}>
        <Card>
          <SectionLabel icon="Target">{t("intent.title")}</SectionLabel>
          <EmptyState
            icon="Target"
            title={t("intent.emptyTitle")}
            body={t("intent.emptyBody")}
            cta={t("intent.classify")}
            onCta={() => classify.mutate()}
            ctaLoading={classify.isPending}
          />
        </Card>
      </div>
    );
  }

  if (!intent) return null;

  const isStale = Boolean(
    prUpdatedAt && intent.source_updated_at && new Date(prUpdatedAt) > new Date(intent.source_updated_at),
  );

  return (
    <div style={s.wrap}>
      <Card>
        <SectionLabel
          icon="Target"
          right={
            intent.confidence === "low" ? (
              <Badge color="var(--warn)" bg="var(--warn-bg)" icon="AlertTriangle">
                {t("intent.confidenceLow")}
              </Badge>
            ) : undefined
          }
        >
          {t("intent.title")}
        </SectionLabel>

        <div style={s.summaryBox}>
          <Icon.MessageSquare size={14} style={s.summaryIcon} />
          <div style={s.summaryText}>{intent.summary}</div>
        </div>

        <div style={s.scopeGrid}>
          <div>
            <div style={s.scopeColumnLabel("ok")}>
              <Icon.CheckCircle size={13} />
              {t("intent.inScope")}
            </div>
            <div style={s.scopeList}>
              {intent.in_scope.length === 0 ? (
                <span style={s.scopeEmpty}>—</span>
              ) : (
                intent.in_scope.map((item) => (
                  <div key={item} style={s.scopeItem}>
                    <span style={s.scopeDot("ok")} />
                    <span>{item}</span>
                  </div>
                ))
              )}
            </div>
          </div>
          <div>
            <div style={s.scopeColumnLabel("crit")}>
              <Icon.XCircle size={13} />
              {t("intent.outOfScope")}
            </div>
            <div style={s.scopeList}>
              {intent.out_of_scope.length === 0 ? (
                <span style={s.scopeEmpty}>—</span>
              ) : (
                intent.out_of_scope.map((item) => (
                  <div key={item} style={s.scopeItem}>
                    <span style={s.scopeDot("crit")} />
                    <span>{item}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div style={s.metaRow}>
          <span style={s.metaLabel}>
            <Icon.Tag size={12} />
            {t("intent.sources")}:
          </span>
          {SOURCE_ORDER.filter((src) => intent.sources.includes(src)).map((src) => (
            <Badge key={src} icon={SOURCE_ICON[src]} color="var(--text-secondary)" bg="var(--bg-hover)">
              {t(`intent.sourceLabel.${src}`)}
            </Badge>
          ))}
        </div>

        {intent.missing_context.length > 0 && (
          <div style={s.missingContext}>
            <strong style={s.missingContextTitle}>
              <Icon.AlertTriangle size={13} />
              {t("intent.missingContext")}
            </strong>
            {intent.missing_context.map((note) => (
              <span key={note}>{note}</span>
            ))}
          </div>
        )}

        {isStale && (
          <div style={s.staleNotice}>
            <Icon.Clock size={13} />
            {t("intent.staleNotice")}
          </div>
        )}

        <div style={s.footer}>
          <span style={s.generatedBy}>
            <Icon.Sparkles size={12} />
            {t("intent.generatedBy", {
              provider: intent.provider,
              model: intent.model,
              date: new Date(intent.generated_at).toLocaleString(),
            })}
          </span>
          <Button
            kind="secondary"
            size="sm"
            icon="RefreshCw"
            loading={classify.isPending}
            onClick={() => classify.mutate()}
          >
            {t("intent.rerun")}
          </Button>
        </div>
      </Card>
    </div>
  );
}
