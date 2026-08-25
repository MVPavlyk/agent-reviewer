import { stringify } from 'yaml';
import { AgentManifest, type AgentManifestInput, type CiFile } from '@devdigest/shared';
import { MANIFEST_DIR, SKILLS_DIR } from './constants.js';
import { safeRelativePath, slugify, uniqueSlugs } from './paths.js';

/**
 * A4 — pure manifest/skill-file generation (SPEC-05 AC-5, AC-6, EC-1, EC-5).
 * No Fastify/Drizzle types here (onion-architecture): the caller (service.ts)
 * resolves an agent row + linked skills into these plain shapes first.
 */

export interface AgentForManifest {
  name: string;
  provider: AgentManifestInput['provider'];
  model: string;
  systemPrompt: string;
  strategy: NonNullable<AgentManifestInput['strategy']>;
  ciFailOn: NonNullable<AgentManifestInput['ci_fail_on']>;
}

export interface SkillForManifest {
  name: string;
  body: string;
}

export interface ManifestBundle {
  agentSlug: string;
  skillSlugs: string[];
  manifestFile: CiFile;
  skillFiles: CiFile[];
}

/**
 * Build `.devdigest/agents/<slug>.yaml` + one `.devdigest/skills/<slug>.md`
 * per linked skill. The manifest is round-tripped through `AgentManifest`
 * (parse, not a hand-built object) so it's guaranteed to satisfy the SAME
 * contract `agent-runner` validates with (NFR-5), then serialized with a real
 * YAML library (not string concatenation) so special characters in
 * `system_prompt` (EC-5) round-trip correctly.
 */
export function buildManifestBundle(
  agent: AgentForManifest,
  skills: SkillForManifest[],
): ManifestBundle {
  const agentSlug = slugify(agent.name, 'agent');
  const skillSlugs = uniqueSlugs(
    skills.map((s) => s.name),
    'skill',
  );

  const manifestInput: AgentManifestInput = {
    name: agent.name,
    provider: agent.provider,
    model: agent.model,
    system_prompt: agent.systemPrompt,
    skills: skillSlugs,
    strategy: agent.strategy,
    ci_fail_on: agent.ciFailOn,
  };
  const manifest = AgentManifest.parse(manifestInput);
  const yaml = stringify(manifest);

  const manifestFile: CiFile = {
    path: safeRelativePath(MANIFEST_DIR, `${agentSlug}.yaml`),
    contents: yaml,
    editable: true,
  };

  const skillFiles: CiFile[] = skills.map((skill, i) => ({
    path: safeRelativePath(SKILLS_DIR, `${skillSlugs[i]}.md`),
    contents: skill.body,
    editable: true,
  }));

  return { agentSlug, skillSlugs, manifestFile, skillFiles };
}
