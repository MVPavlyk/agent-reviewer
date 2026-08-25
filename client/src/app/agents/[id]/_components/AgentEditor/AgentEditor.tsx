/* AgentEditor — basic agent config editor (model + system prompt). L-02 added
   Skills, project-context lessons added Context, L-06 adds Evals, SPEC-06
   Pass 8 adds CI. Stats from the original mockup stays out of scope. Tab
   state lives in ?tab=. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Tabs } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { ConfigTab } from "./_components/ConfigTab";
import { SkillsTab } from "./_components/SkillsTab";
import { ContextTab } from "./_components/ContextTab";
import { EvalsTab } from "./_components/EvalsTab";
import { CITab } from "../CITab";
import { TABS } from "./constants";
import { s } from "./styles";

export function AgentEditor({ agent, tab, onTab }: { agent: Agent; tab: string; onTab: (t: string) => void }) {
  const t = useTranslations("agents");
  const tabs = TABS.map((tb) => ({ key: tb.key, label: t(tb.labelKey), icon: tb.icon }));

  // key={agent.id} remounts the active tab on agent switch so its local
  // state resets cleanly, instead of an effect syncing props into state.
  let body = <ConfigTab key={agent.id} agent={agent} />;
  if (tab === "skills") body = <SkillsTab key={agent.id} agent={agent} />;
  else if (tab === "context") body = <ContextTab key={agent.id} agent={agent} />;
  else if (tab === "evals") body = <EvalsTab key={agent.id} agent={agent} />;
  else if (tab === "ci") body = <CITab key={agent.id} agent={agent} />;

  return (
    <div style={s.wrap}>
      <div style={s.tabsBar}>
        <Tabs tabs={tabs} value={tab} onChange={onTab} pad="0 24px" />
      </div>
      <div style={s.body}>{body}</div>
    </div>
  );
}
