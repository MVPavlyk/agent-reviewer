import type { SkillType } from "@devdigest/shared";

/** Small, feature-local copy of the same type list SkillForm uses — kept
 *  separate rather than importing across the skills route's private
 *  `_components` folder (see the import-hygiene skill). Defaults to
 *  "convention" here, unlike SkillForm's "rubric" default, since every draft
 *  this modal builds IS a merged set of conventions. */
export const DEFAULT_TYPE: SkillType = "convention";

export const TYPE_OPTIONS: { value: SkillType; label: string }[] = [
  { value: "rubric", label: "Rubric" },
  { value: "convention", label: "Convention" },
  { value: "security", label: "Security" },
  { value: "custom", label: "Custom" },
];
