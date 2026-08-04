/* /skills — Skills list + preview (A1, L-02). Two-pane layout mirroring
   /agents/[id]: a fixed-width list column + a flex preview pane. Selection is
   URL-owned state (`?skill=<id>`), per the frontend-architecture rule that the
   active item lives in search params, not useState — matches the existing
   `?findingItem=` pattern (client/INSIGHTS.md). No `/skills/[id]` route
   (docs/specs/skills.md decision 6). */
"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton, Icon } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { filterSkills } from "@/components/skill-picker";
import { useSkills } from "@/lib/hooks/skills";
import { SkillCard } from "../SkillCard";
import { SkillDetailTabs } from "../SkillDetailTabs";
import { DEFAULT_TAB, TABS as DETAIL_TABS } from "../SkillDetailTabs/constants";
import { AddSkillDrawer } from "../AddSkillDrawer";
import { s } from "./styles";

const VALID_TABS = DETAIL_TABS.map((tb) => tb.key);

export function SkillsListView() {
  const t = useTranslations("skills");
  const router = useRouter();
  const search = useSearchParams();
  const { data: skills, isLoading, isError, refetch } = useSkills();
  const [adding, setAdding] = React.useState(false);
  const [query, setQuery] = React.useState("");

  const selectedId = search.get("skill");
  const tab = VALID_TABS.includes(search.get("tab") ?? "") ? search.get("tab")! : DEFAULT_TAB;

  const setSelectedId = (id: string) => {
    const sp = new URLSearchParams(search.toString());
    sp.set("skill", id);
    router.replace(`/skills?${sp.toString()}`);
  };
  const setTab = (nextTab: string) => {
    const sp = new URLSearchParams(search.toString());
    sp.set("tab", nextTab);
    router.replace(`/skills?${sp.toString()}`);
  };

  const list = filterSkills(skills ?? [], query);
  const selected = (skills ?? []).find((sk) => sk.id === selectedId) ?? null;

  return (
    <AppShell crumb={[{ label: t("page.crumbLab") }, { label: t("page.crumbSkills") }]}>
      {adding && <AddSkillDrawer onClose={() => setAdding(false)} onCreated={setSelectedId} />}
      <div style={s.wrap}>
        <div style={s.listCol}>
          <div style={s.listColHead}>
            <div style={s.headerRow}>
              <h1 style={s.h1}>{t("page.heading")}</h1>
              <Button kind="primary" size="sm" icon="Plus" onClick={() => setAdding(true)}>
                {t("page.addSkill")}
              </Button>
            </div>
            <div style={s.search}>
              <Icon.Search size={13} style={s.searchIcon} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("page.searchPlaceholder")}
                style={s.searchInput}
              />
            </div>
          </div>
          <div style={s.listBody}>
            {isLoading && (
              <>
                <Skeleton height={90} />
                <Skeleton height={90} />
              </>
            )}
            {isError && <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />}
            {!isLoading && !isError && list.length === 0 && (
              <EmptyState
                icon="Sparkles"
                title={t("page.empty.title")}
                body={t("page.empty.body")}
                cta={t("page.empty.cta")}
                onCta={() => setAdding(true)}
              />
            )}
            {list.map((sk) => (
              <SkillCard key={sk.id} skill={sk} active={sk.id === selectedId} onClick={() => setSelectedId(sk.id)} />
            ))}
          </div>
        </div>
        <div style={s.previewCol}>
          {selected ? (
            // key={selected.id} remounts the tabs on selection change so any
            // tab-local state resets, instead of an effect syncing props.
            <SkillDetailTabs key={selected.id} skill={selected} tab={tab} onTab={setTab} />
          ) : (
            <div style={s.selectPrompt}>
              <div style={s.selectPromptTitle}>{t("page.selectPrompt.title")}</div>
              <div style={s.selectPromptBody}>{t("page.selectPrompt.body")}</div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
