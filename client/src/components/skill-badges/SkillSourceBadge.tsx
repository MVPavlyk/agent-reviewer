"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { SkillSource } from "@devdigest/shared";
import { SOURCE_ICON } from "./helpers";

export function SkillSourceBadge({ source }: { source: SkillSource }) {
  const t = useTranslations("skills");
  return (
    <Badge icon={SOURCE_ICON[source]} color="var(--text-muted)" mono>
      {t(`listItem.source.${source}`)}
    </Badge>
  );
}
