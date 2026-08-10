"use client";

import React from "react";
import type { Skill } from "@devdigest/shared";
import { SkillTypeBadge } from "../skill-badges";
import { s } from "./styles";

/**
 * One skill row — name + type badge, an optional right-side interaction slot
 * (a `Toggle` for the agent Skills tab's attach list, nothing for the
 * `/skills` grid preview). Shared so both surfaces render a skill identically.
 */
export function SkillPickerRow({
  skill,
  active,
  onClick,
  right,
}: {
  skill: Skill;
  active?: boolean;
  onClick?: () => void;
  right?: React.ReactNode;
}) {
  return (
    <div onClick={onClick} style={{ ...s.row(!!active), cursor: onClick ? "pointer" : undefined }}>
      <span style={s.name}>{skill.name}</span>
      <div style={s.badges}>
        <SkillTypeBadge type={skill.type} />
        {right}
      </div>
    </div>
  );
}
