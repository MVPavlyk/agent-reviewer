import type { LinkedSkillRow } from '../agents/repository.js';

/**
 * A1 — the skills domain rule for prompt resolution (decision 1 in
 * docs/specs/skills.md): `skills.enabled = false` excludes a skill from the
 * prompt EVERYWHERE, even when the agent link remains. Both flags — the link
 * and the skill's own `enabled` — gate whether a body reaches the model.
 *
 * Pure: no I/O. Formats each enabled skill as its own `### <name>` block so
 * per-skill boundaries are visible in the run trace (reviewer-core's
 * `assembly.skills` is a bare `join('\n\n')`).
 */
export function selectSkillBodies(links: LinkedSkillRow[]): string[] {
  return links
    .filter((l) => l.skill.enabled)
    .sort((a, b) => a.order - b.order)
    .map((l) => `### ${l.skill.name}\n${l.skill.body}`);
}
