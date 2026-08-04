"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { TYPE_ICON } from "./helpers";

export function SkillTypeBadge({ type }: { type: SkillType }) {
  const t = useTranslations("skills");
  return (
    <Badge icon={TYPE_ICON[type]} color="var(--text-secondary)">
      {t(`listItem.type.${type}`)}
    </Badge>
  );
}
