/* SkillCard — mirrors AgentCard: icon + name + enabled toggle + delete, type/
   source/needs-vetting badges instead of a model chip. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { NeedsVettingBadge, SkillSourceBadge, SkillTypeBadge, needsVetting } from "@/components/skill-badges";
import { useDeleteSkill, useUpdateSkill } from "@/lib/hooks/skills";
import { s } from "./styles";

export function SkillCard({
  skill,
  active,
  onClick,
}: {
  skill: Skill;
  active?: boolean;
  onClick?: () => void;
}) {
  const t = useTranslations("skills");
  const update = useUpdateSkill();
  const del = useDeleteSkill();
  return (
    <div onClick={onClick} style={s.card(!!active, skill.enabled)}>
      <div style={s.headerRow}>
        <Icon.Sparkles size={15} style={s.icon} />
        <span style={s.name}>{skill.name}</span>
        <div onClick={(e) => e.stopPropagation()}>
          <Toggle
            on={skill.enabled}
            onChange={(enabled) => update.mutate({ id: skill.id, patch: { enabled } })}
            size={13}
            label={`${skill.name} enabled`}
          />
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (window.confirm(`Delete skill "${skill.name}"? This cannot be undone.`)) del.mutate(skill.id);
          }}
          disabled={del.isPending}
          title="Delete skill"
          aria-label="Delete skill"
          style={s.deleteBtn}
        >
          <Icon.Trash size={14} style={del.isPending ? { animation: "ddspin 1s linear infinite" } : undefined} />
        </button>
      </div>
      <div style={s.description}>{skill.description}</div>
      <div style={s.metaRow}>
        <SkillTypeBadge type={skill.type} />
        <SkillSourceBadge source={skill.source} />
        {needsVetting(skill) && <NeedsVettingBadge />}
      </div>
      <div style={s.statsRow}>
        {t("card.stats", {
          agents: skill.agents_count,
          pull: Math.round(skill.pull_rate * 100),
          accept: Math.round(skill.accept_rate * 100),
        })}
      </div>
    </div>
  );
}
