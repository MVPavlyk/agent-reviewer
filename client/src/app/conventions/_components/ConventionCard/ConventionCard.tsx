/* ConventionCard — title + confidence, file:line evidence + snippet, and
   Accept/Reject actions. "Selected for merge" IS "accepted" — no separate
   selection state: the Accept button turning solid blue (kind="primary") is
   the ONLY signal, and "Deselect all" (in ConventionsListView) bulk-reverts
   accepted→pending rather than toggling a hidden local Set. `Button`'s
   `active` prop has no visual effect for kind="secondary"/"ghost" (only
   "tertiary" reads it — see vendor/ui/primitives/Button.tsx), so the actual
   state swaps `kind` itself instead of relying on `active` for color. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, ConfidenceNum, IconBtn, MonoLink, ProgressBar } from "@devdigest/ui";
import type { ConventionCandidate } from "@devdigest/shared";
import { useUpdateConvention } from "@/lib/hooks/conventions";
import { githubBlobUrl } from "@/lib/github-urls";
import { confidenceColor, lineLabel } from "./helpers";
import { s } from "./styles";

export function ConventionCard({
  convention,
  repoId,
  repoFullName,
  headSha,
}: {
  convention: ConventionCandidate;
  repoId: string;
  /** owner/repo + the commit the last scan indexed — enough to deep-link the
   *  evidence to the real file on GitHub. Either missing → plain text (no
   *  crash, no dead link guessed from a stale sha). */
  repoFullName?: string | null;
  headSha?: string | null;
}) {
  const t = useTranslations("conventions");
  const update = useUpdateConvention();
  const [copied, setCopied] = React.useState(false);

  const accepted = convention.status === "accepted";
  const rejected = convention.status === "rejected";
  const pct = Math.round((convention.confidence ?? 0) * 100);
  const location = convention.evidence_path
    ? `${convention.evidence_path}${convention.start_line != null ? `:${lineLabel(convention)}` : ""}`
    : null;
  const fileHref =
    repoFullName && headSha && convention.evidence_path
      ? githubBlobUrl(
          repoFullName,
          headSha,
          convention.evidence_path,
          convention.start_line ?? undefined,
          convention.end_line ?? undefined,
        )
      : undefined;

  const copySnippet = () => {
    void navigator.clipboard?.writeText(convention.evidence_snippet ?? "");
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div style={s.card}>
      <div style={s.header}>
        <div style={s.titleWrap}>
          <span style={s.title}>{convention.title}</span>
        </div>
        <div style={s.actions}>
          <Button
            kind={accepted ? "primary" : "secondary"}
            size="sm"
            icon="Check"
            disabled={update.isPending}
            onClick={() => update.mutate({ id: convention.id, repoId, action: "accept" })}
          >
            {update.isPending && update.variables?.id === convention.id && update.variables.action === "accept"
              ? t("card.accepting")
              : t("card.accept")}
          </Button>
          <Button
            kind={rejected ? "danger" : "ghost"}
            size="sm"
            icon="X"
            disabled={update.isPending}
            onClick={() => update.mutate({ id: convention.id, repoId, action: "reject" })}
          >
            {update.isPending && update.variables?.id === convention.id && update.variables.action === "reject"
              ? t("card.rejecting")
              : t("card.reject")}
          </Button>
        </div>
      </div>

      {location && (
        <div style={s.snippetBlock}>
          <div style={s.snippetHeader}>
            <MonoLink href={fileHref}>{location}</MonoLink>
            <IconBtn
              icon={copied ? "Check" : "Copy"}
              label={copied ? t("card.copied") : t("card.copy")}
              onClick={copySnippet}
            />
          </div>
          {convention.evidence_snippet && (
            <pre className="mono" style={s.snippetPre}>
              {convention.evidence_snippet}
            </pre>
          )}
        </div>
      )}

      <div style={s.confidenceRow}>
        <span style={s.confidenceLabel}>{t("card.confidence")}</span>
        <div style={s.confidenceBarWrap}>
          <ProgressBar value={pct} color={confidenceColor(pct)} />
        </div>
        <ConfidenceNum value={convention.confidence ?? 0} />
      </div>
    </div>
  );
}
