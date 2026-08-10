import type { SkillType } from "@devdigest/shared";

export const DEFAULT_TYPE: SkillType = "rubric";

export const TYPE_OPTIONS: { value: SkillType; label: string }[] = [
  { value: "rubric", label: "Rubric" },
  { value: "convention", label: "Convention" },
  { value: "security", label: "Security" },
  { value: "custom", label: "Custom" },
];
