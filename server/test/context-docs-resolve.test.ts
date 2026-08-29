import { describe, it, expect } from 'vitest';
import { resolveContextDocs } from '../src/modules/context-docs/resolve.js';

describe('resolveContextDocs', () => {
  it('returns [] for an empty input', () => {
    expect(resolveContextDocs({ skills: [], agentDocs: [] })).toEqual([]);
  });

  it('orders skills by their link order, each skill docs by its own order, then agent docs (AC-22, A-3)', () => {
    const result = resolveContextDocs({
      skills: [
        {
          id: 's2',
          name: 'Second',
          enabled: true,
          order: 1,
          docs: [{ path: 'skills/s2-b.md', order: 1 }, { path: 'skills/s2-a.md', order: 0 }],
        },
        {
          id: 's1',
          name: 'First',
          enabled: true,
          order: 0,
          docs: [{ path: 'skills/s1.md', order: 0 }],
        },
      ],
      agentDocs: [
        { path: 'agent/b.md', order: 1 },
        { path: 'agent/a.md', order: 0 },
      ],
    });

    expect(result.map((r) => r.path)).toEqual([
      'skills/s1.md',
      'skills/s2-a.md',
      'skills/s2-b.md',
      'agent/a.md',
      'agent/b.md',
    ]);
    expect(result.map((r) => r.source)).toEqual(['skill', 'skill', 'skill', 'agent', 'agent']);
  });

  it('drops a disabled skill entirely, its docs never appear (EC-11)', () => {
    const result = resolveContextDocs({
      skills: [
        { id: 's1', name: 'Disabled', enabled: false, order: 0, docs: [{ path: 'x.md', order: 0 }] },
      ],
      agentDocs: [],
    });
    expect(result).toEqual([]);
  });

  it('deduplicates a path shared by two skills, keeping the first occurrence and its position (AC-21, EC-9)', () => {
    const result = resolveContextDocs({
      skills: [
        { id: 's1', name: 'First', enabled: true, order: 0, docs: [{ path: 'shared.md', order: 0 }] },
        { id: 's2', name: 'Second', enabled: true, order: 1, docs: [{ path: 'shared.md', order: 0 }] },
      ],
      agentDocs: [],
    });
    expect(result).toEqual([
      { path: 'shared.md', order: 0, source: 'skill', skillId: 's1', skillName: 'First' },
    ]);
  });

  it('a path attached both directly to the agent and via an enabled skill surfaces once, as the skill attachment (SPEC-02 EC-6)', () => {
    const result = resolveContextDocs({
      skills: [
        { id: 's1', name: 'Shared', enabled: true, order: 0, docs: [{ path: 'dup.md', order: 0 }] },
      ],
      agentDocs: [{ path: 'dup.md', order: 0 }],
    });
    expect(result).toEqual([
      { path: 'dup.md', order: 0, source: 'skill', skillId: 's1', skillName: 'Shared' },
    ]);
  });
});
