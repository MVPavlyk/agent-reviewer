import { describe, it, expect } from 'vitest';
import { selectSkillBodies } from '../src/modules/skills/prompt-blocks.js';
import type { LinkedSkillRow } from '../src/modules/agents/repository.js';
import type { SkillRow } from '../src/db/rows.js';

/**
 * Encodes decision 1 from docs/specs/skills.md: `skills.enabled = false`
 * excludes a skill from the prompt EVERYWHERE, even when the agent link
 * remains — the resolver checks both flags (the link's existence AND the
 * skill's own `enabled`).
 */

function skillRow(overrides: Partial<SkillRow> = {}): SkillRow {
  return {
    id: 'skill-1',
    workspaceId: 'ws-1',
    name: 'Rubric',
    description: 'desc',
    type: 'rubric',
    source: 'manual',
    body: 'Body text.',
    enabled: true,
    version: 1,
    evidenceFiles: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function link(skill: Partial<SkillRow>, order: number): LinkedSkillRow {
  return { skill: skillRow(skill), order };
}

describe('selectSkillBodies', () => {
  it('excludes a linked but globally-disabled skill', () => {
    const links = [
      link({ id: 's1', name: 'Enabled Skill', enabled: true }, 0),
      link({ id: 's2', name: 'Disabled Skill', enabled: false }, 1),
    ];
    const bodies = selectSkillBodies(links);
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toContain('Enabled Skill');
    expect(bodies.join('\n')).not.toContain('Disabled Skill');
  });

  it('respects order, independent of input array order', () => {
    const links = [
      link({ id: 's2', name: 'Second', body: 'B', enabled: true }, 1),
      link({ id: 's1', name: 'First', body: 'A', enabled: true }, 0),
    ];
    const bodies = selectSkillBodies(links);
    expect(bodies).toEqual(['### First\nA', '### Second\nB']);
  });

  it('formats each enabled skill as its own ### <name> block', () => {
    const bodies = selectSkillBodies([link({ name: 'API Contract Rubric', body: 'Check X.' }, 0)]);
    expect(bodies).toEqual(['### API Contract Rubric\nCheck X.']);
  });

  it('returns [] when every linked skill is disabled — the section is omitted', () => {
    const links = [
      link({ id: 's1', enabled: false }, 0),
      link({ id: 's2', enabled: false }, 1),
    ];
    expect(selectSkillBodies(links)).toEqual([]);
  });

  it('returns [] for no linked skills', () => {
    expect(selectSkillBodies([])).toEqual([]);
  });
});
