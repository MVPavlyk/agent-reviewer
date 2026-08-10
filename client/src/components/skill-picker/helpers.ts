import type { Skill } from "@devdigest/shared";

/** Case-insensitive filter over a skill's name + description — shared by the
 *  `/skills` grid search and the agent Skills tab's attach-list filter. */
export function filterSkills(skills: Skill[], query: string): Skill[] {
  const q = query.trim().toLowerCase();
  if (!q) return skills;
  return skills.filter((s) => `${s.name} ${s.description}`.toLowerCase().includes(q));
}
