import type { Skill, SkillSource, SkillType } from "@devdigest/shared";
import type { IconName } from "@devdigest/ui";

export const TYPE_ICON: Record<SkillType, IconName> = {
  rubric: "ListChecks",
  convention: "Boxes",
  security: "Shield",
  custom: "Wrench",
};

export const SOURCE_ICON: Record<SkillSource, IconName> = {
  manual: "Edit",
  extracted: "FileText",
  imported_url: "Link",
  community: "Users",
};

/**
 * Whether a skill's provenance should be flagged for human review before it's
 * enabled. Per docs/specs/skills.md decision 5, this is UI copy only — a
 * talking point, not a mechanism: an imported skill's body still enters the
 * prompt as an instruction (no forced `enabled = false`, no `<untrusted>`
 * fence). The only real defense is a human reading the preview before saving.
 */
export function needsVetting(skill: Pick<Skill, "source">): boolean {
  return skill.source !== "manual";
}
