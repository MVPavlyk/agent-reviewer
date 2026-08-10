/* SkillsTab — attach/detach + reorder an agent's linked skills. Reordering
   uses ArrowUp/ArrowDown IconBtns (no DnD library — untestable in jsdom,
   strictly less accessible than buttons per docs/specs/skills.md). Every
   mutation replaces the WHOLE ordered set via `POST /agents/:id/skills`
   (`useSetAgentSkills`), which already assigns order = index server-side —
   no new API needed. `key={link.skill_id}` throughout, never the index. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { IconBtn, Toggle } from "@devdigest/ui";
import type { Agent, Skill } from "@devdigest/shared";
import { filterSkills, SkillPickerRow } from "@/components/skill-picker";
import { useAgentSkills, useSetAgentSkills, useSkills } from "@/lib/hooks/skills";
import { EMPTY_QUERY } from "./constants";
import { moveItem } from "./helpers";
import { s } from "./styles";

export function SkillsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const tSkills = useTranslations("skills");
  const { data: skills } = useSkills();
  const { data: links } = useAgentSkills(agent.id);
  const setSkills = useSetAgentSkills();
  const [query, setQuery] = React.useState(EMPTY_QUERY);

  // Derive, don't store: render straight from query data — the mutation's
  // onSuccess invalidates ["agent-skills", agentId] and this recomputes.
  const linked: Skill[] = (links ?? [])
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((l) => (skills ?? []).find((sk) => sk.id === l.skill_id))
    .filter((sk): sk is Skill => sk != null);

  const linkedIds = new Set(linked.map((sk) => sk.id));
  const attachable = filterSkills((skills ?? []).filter((sk) => !linkedIds.has(sk.id)), query);

  const apply = (skillIds: string[]) => setSkills.mutate({ agentId: agent.id, skillIds });

  const detach = (skillId: string) => apply(linked.map((sk) => sk.id).filter((id) => id !== skillId));
  const attach = (skillId: string) => apply([...linked.map((sk) => sk.id), skillId]);
  const move = (index: number, to: number) => apply(moveItem(linked.map((sk) => sk.id), index, to));

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h3 style={s.title}>{t("skills.title")}</h3>
        <span style={s.count}>
          {t("skills.enabledCount", { linked: linked.length, total: skills?.length ?? 0 })}
        </span>
      </div>
      <div style={s.hint}>{t("skills.orderHint")}</div>

      {linked.length > 0 && (
        <div style={s.linkedList}>
          {linked.map((sk, i) => (
            <SkillPickerRow
              key={sk.id}
              skill={sk}
              right={
                <div style={s.rowActions}>
                  <IconBtn
                    icon="ArrowUp"
                    label={tSkills("reorder.moveUp")}
                    size={24}
                    onClick={() => move(i, i - 1)}
                    disabled={i === 0 || setSkills.isPending}
                  />
                  <IconBtn
                    icon="ArrowDown"
                    label={tSkills("reorder.moveDown")}
                    size={24}
                    onClick={() => move(i, i + 1)}
                    disabled={i === linked.length - 1 || setSkills.isPending}
                  />
                  <Toggle
                    on
                    onChange={() => detach(sk.id)}
                    size={13}
                    label={`${sk.name} attached`}
                    disabled={setSkills.isPending}
                  />
                </div>
              }
            />
          ))}
        </div>
      )}

      <div style={s.sectionLabel}>{tSkills("page.heading")}</div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("skills.filterPlaceholder")}
        style={s.filterInput}
      />
      <div style={s.attachList}>
        {attachable.length === 0 && <div style={s.empty}>{tSkills("page.empty.title")}</div>}
        {attachable.map((sk) => (
          <SkillPickerRow
            key={sk.id}
            skill={sk}
            right={
              <Toggle
                on={false}
                onChange={() => attach(sk.id)}
                size={13}
                label={`${sk.name} attached`}
                disabled={setSkills.isPending}
              />
            }
          />
        ))}
      </div>
    </div>
  );
}
