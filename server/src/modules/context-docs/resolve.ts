/**
 * Pure resolver for "which context docs does this agent actually get"
 * (SPEC-01 AC-20..AC-22, EC-9, EC-11, 30-plan.md Крок 7). No I/O, no Drizzle
 * or Fastify type in the signature — the domain core of this module, on
 * purpose mirroring `modules/skills/prompt-blocks.ts`'s `selectSkillBodies`
 * (same `skill.enabled` gate, same "pure function over plain structs" shape).
 *
 * Implemented ahead of its own Крок 7 slot: Крок 6's `GET
 * /agents/:id/context-docs` needs the exact same resolution `ReviewRunExecutor`
 * (Крок 8) will later use, per 30-plan.md §2 point 2 — "UI і промт не можуть
 * розійтися" (the run-time prompt and the editor's read of "what's attached"
 * must never disagree). Building a second, throwaway resolution just for the
 * GET route would be exactly the divergence risk that requirement exists to
 * prevent. Крок 8 (run-executor) is expected to import this file unchanged.
 */

export interface ResolveSkillDoc {
  path: string;
  order: number;
}

export interface ResolveSkillInput {
  id: string;
  name: string;
  enabled: boolean;
  /** The agent↔skill link's order (agent_skills.order), NOT the skill's own version. */
  order: number;
  docs: ResolveSkillDoc[];
}

export interface ResolveAgentDoc {
  path: string;
  order: number;
}

export interface ResolveContextDocsInput {
  skills: ResolveSkillInput[];
  agentDocs: ResolveAgentDoc[];
}

export interface ResolvedContextDoc {
  path: string;
  /** The doc's own order within its source list (skill's docs, or the agent's own list) — NOT a global index. */
  order: number;
  source: 'agent' | 'skill';
  skillId?: string;
  skillName?: string;
}

/**
 * Order: skills first (by `agent_skills.order`, i.e. `ResolveSkillInput.order`),
 * each skill's own docs by their `order`, THEN the agent's own docs by their
 * `order` (A-3). A `skill.enabled === false` drops that skill's docs entirely
 * (EC-11) — mirrors `selectSkillBodies`'s prompt-wide enabled gate. A path
 * that appears more than once (from two skills, or from a skill AND the
 * agent's own list) keeps only its FIRST occurrence, at that occurrence's
 * position (AC-21, EC-9) — so a doc attached both directly and via a skill
 * surfaces once, as the skill attachment (SPEC-02 EC-6).
 */
export function resolveContextDocs(input: ResolveContextDocsInput): ResolvedContextDoc[] {
  const out: ResolvedContextDoc[] = [];
  const seen = new Set<string>();

  const enabledSkills = input.skills.filter((s) => s.enabled).sort((a, b) => a.order - b.order);
  for (const skill of enabledSkills) {
    const docs = [...skill.docs].sort((a, b) => a.order - b.order);
    for (const doc of docs) {
      if (seen.has(doc.path)) continue;
      seen.add(doc.path);
      out.push({
        path: doc.path,
        order: doc.order,
        source: 'skill',
        skillId: skill.id,
        skillName: skill.name,
      });
    }
  }

  const agentDocs = [...input.agentDocs].sort((a, b) => a.order - b.order);
  for (const doc of agentDocs) {
    if (seen.has(doc.path)) continue;
    seen.add(doc.path);
    out.push({ path: doc.path, order: doc.order, source: 'agent' });
  }

  return out;
}
