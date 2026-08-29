/* SkillDetailTabs — replaces the /skills page's single-pane SkillPreviewPane
   with a tabbed detail view (Config · Preview · Stats · Versions), mirroring
   AgentEditor's Tabs-driven shell. Tab state is owned by the caller (`?tab=`
   alongside `?skill=` in SkillsListView) — same URL-owned-state rule as the
   selected-skill id. */
"use client";

import { useTranslations } from "next-intl";
import { Tabs } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { ConfigTab } from "./_components/ConfigTab";
import { ContextTab } from "./_components/ContextTab";
import { PreviewTab } from "./_components/PreviewTab";
import { StatsTab } from "./_components/StatsTab";
import { VersionsTab } from "./_components/VersionsTab";
import { TABS } from "./constants";
import { s } from "./styles";

export function SkillDetailTabs({
  skill,
  tab,
  onTab,
}: {
  skill: Skill;
  tab: string;
  onTab: (t: string) => void;
}) {
  const t = useTranslations("skills");
  const tabs = TABS.map((tb) => ({ key: tb.key, label: t(tb.labelKey), icon: tb.icon }));

  let body = <ConfigTab skill={skill} />;
  if (tab === "preview") body = <PreviewTab skill={skill} />;
  else if (tab === "stats") body = <StatsTab skill={skill} />;
  else if (tab === "versions") body = <VersionsTab skill={skill} />;
  else if (tab === "context") body = <ContextTab skill={skill} />;

  return (
    <div style={s.wrap}>
      <div style={s.tabsBar}>
        <Tabs tabs={tabs} value={tab} onChange={onTab} pad="0 24px" />
      </div>
      <div style={s.body}>{body}</div>
    </div>
  );
}
