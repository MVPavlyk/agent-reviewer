"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, IconBtn, Markdown } from "@devdigest/ui";
import type { ContextDoc } from "@/lib/types";
import { basename } from "./helpers";
import { s } from "./styles";

/**
 * One row — a resolved attachment (linked or attachable). `doc` is looked up
 * from the repo scan by path; its absence means `missing` (the path was
 * attached before but the file is gone from the clone now, SPEC-02 AC-36).
 */
export function ContextDocRow({
  path,
  doc,
  sourceLabel,
  right,
  previewing,
  onTogglePreview,
  previewContent,
  previewLoading,
  previewTruncated,
}: {
  path: string;
  doc?: ContextDoc;
  /** e.g. the source skill's name, for an inherited (`source:'skill'`) row. */
  sourceLabel?: string;
  right?: React.ReactNode;
  previewing?: boolean;
  onTogglePreview?: () => void;
  previewContent?: string | null;
  previewLoading?: boolean;
  previewTruncated?: boolean;
}) {
  const t = useTranslations("context");
  const missing = !doc;
  const excludedReason = doc?.excluded_reason ?? null;

  return (
    <div>
      <div style={s.row}>
        <div style={s.rowMain}>
          <span style={s.rowPath} title={path}>
            {basename(path)}
          </span>
          {doc?.dir_type && <Badge mono>{doc.dir_type}</Badge>}
          {sourceLabel && <Badge>{t("picker.inheritedVia", { skill: sourceLabel })}</Badge>}
          {missing && (
            <Badge color="var(--warn)" bg="var(--warn-bg, rgba(200,150,0,0.08))">
              {t("picker.missing")}
            </Badge>
          )}
          {excludedReason && (
            <Badge color="var(--warn)" bg="var(--warn-bg, rgba(200,150,0,0.08))">
              {t(`picker.excludedReason.${excludedReason}`)}
            </Badge>
          )}
          {doc && !excludedReason && (
            <span style={s.rowTokens}>{t("picker.tokensApprox", { count: doc.tokens })}</span>
          )}
        </div>
        <div style={s.rowRight}>
          {onTogglePreview && (
            <IconBtn
              icon="Eye"
              label={t("picker.preview", { path })}
              size={24}
              active={previewing}
              onClick={onTogglePreview}
            />
          )}
          {right}
        </div>
      </div>
      {previewing && (
        <div style={s.previewBox}>
          {previewTruncated && <div>{t("docs.truncated")}</div>}
          {previewLoading ? t("picker.previewLoading") : <Markdown>{previewContent}</Markdown>}
        </div>
      )}
    </div>
  );
}
