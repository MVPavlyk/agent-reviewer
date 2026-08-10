"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";

export function NeedsVettingBadge() {
  const t = useTranslations("skills");
  return (
    <Badge icon="AlertTriangle" color="var(--warn)" bg="var(--warn-bg)" style={{ textTransform: "none" }}>
      <span title={t("listItem.vettingTitle")}>{t("listItem.needsVetting")}</span>
    </Badge>
  );
}
