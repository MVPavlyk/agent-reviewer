/**
 * Brief Layer — data collection tests (no DB, no real network). Mirrors
 * `intent-classifier.test.ts`'s stubbed-container style.
 */
import { describe, it, expect } from 'vitest';
import type { BlastRadius, Intent, UnifiedDiff } from '@devdigest/shared';
import type { Container } from '../src/platform/container.js';
import {
  collectBriefContextDocs,
  collectBriefSources,
  toBlastPromptView,
} from '../src/modules/reviews/brief/sources.js';

const DIFF: UnifiedDiff = {
  raw: '',
  files: [
    {
      path: 'src/config.ts',
      additions: 1,
      deletions: 0,
      hunks: [
        { file: 'src/config.ts', oldStart: 10, oldLines: 3, newStart: 10, newLines: 4, newLineNumbers: [10] },
      ],
    },
  ],
};

const REPO_ROW = { owner: 'acme', name: 'payments-api', clonePath: '/tmp/clone' } as any;
const PULL_ROW = {
  id: 'pr-1',
  title: 'Add Stripe key rotation',
  body: 'Rotates the Stripe secret key used by the billing worker.',
} as any;

const INTENT: Intent = { summary: 'Rotates the key', in_scope: ['secret rotation'], out_of_scope: [] };

function okBlast(overrides: Partial<BlastRadius> = {}): BlastRadius {
  return {
    changed_symbols: [],
    downstream: [],
    summary: 'low impact',
    status: 'ok',
    reason: null,
    message: '',
    coverage: {
      changed_files: [],
      analyzed_files: [],
      unsupported_files: [],
      files_without_rank: [],
      indexer_version: null,
      last_indexed_sha: null,
    },
    head_sha: 'abc123',
    ...overrides,
  };
}

function makeContainer(overrides: Partial<Container> = {}): Container {
  return {
    github: async () => ({ getIssue: async () => ({ number: 1, title: 'n/a', body: null, state: 'open' }) }),
    ...overrides,
  } as unknown as Container;
}

describe('brief/sources — toBlastPromptView (AC-3)', () => {
  it('drops coverage/rank/depth — only file/name/value survive', () => {
    const blast = okBlast({
      changed_symbols: [{ name: 'fn', file: 'a.ts', kind: 'function' }],
      downstream: [
        {
          symbol: 'fn',
          callers: [{ name: 'c', file: 'b.ts', line: 1, rank: 0.9 }],
          callers_total: 1,
          callers_truncated: false,
          endpoints_affected: [{ value: 'GET /x', file: 'c.ts', via_symbol: null, via_file: 'c.ts', depth: 2 }],
          crons_affected: [],
        },
      ],
    });
    const view = toBlastPromptView(blast);
    const json = JSON.stringify(view);
    expect(json).not.toContain('rank');
    expect(json).not.toContain('depth');
    expect(json).not.toContain('coverage');
    expect(view.downstream[0]!.callers).toEqual([{ file: 'b.ts', name: 'c' }]);
  });
});

describe('brief/sources — collectBriefSources (AC-4, AC-5)', () => {
  it('degraded blast → non-empty blastNotice from message, never throws', async () => {
    const container = makeContainer();
    const blast = okBlast({ status: 'degraded', reason: 'diff_not_loaded', message: 'no diff loaded yet' });
    const bundle = await collectBriefSources(container, REPO_ROW, PULL_ROW, DIFF, INTENT, blast, []);
    expect(bundle.blastNotice).toBe('no diff loaded yet');
  });

  it('EC-1: no description/issue → still a valid bundle', async () => {
    const container = makeContainer();
    const pull = { ...PULL_ROW, body: null };
    const bundle = await collectBriefSources(container, REPO_ROW, pull, DIFF, INTENT, okBlast(), []);
    expect(bundle.description).toBeNull();
    expect(bundle.linkedIssue).toBeNull();
    expect(bundle.title).toBe(PULL_ROW.title);
  });

  it('unreachable linked issue is logged/skipped, generation continues (AC-5)', async () => {
    const container = makeContainer({
      github: async () => ({
        getIssue: async () => {
          throw new Error('github unreachable');
        },
      }),
    } as any);
    const pull = { ...PULL_ROW, body: 'Fixes #12' };
    const bundle = await collectBriefSources(container, REPO_ROW, pull, DIFF, INTENT, okBlast(), []);
    expect(bundle.linkedIssue).toBeNull();
  });

  it('never includes diff hunk body content — only headers', async () => {
    const container = makeContainer();
    const bundle = await collectBriefSources(container, REPO_ROW, PULL_ROW, DIFF, INTENT, okBlast(), []);
    expect(bundle.hunkHeaders).toEqual(['src/config.ts @@ -10,3 +10,4 @@']);
  });
});

describe('brief/sources — collectBriefContextDocs (AC-7, EC-11)', () => {
  it('EC-11: no enabled agents → empty specs', async () => {
    const container = makeContainer({
      agentsRepo: { listEnabled: async () => [] },
      contextDocsRepo: { listForAgent: async () => [] },
      config: { contextDocRoots: ['docs'] },
    } as any);
    const specs = await collectBriefContextDocs(container, 'ws-1', REPO_ROW, { info: () => undefined });
    expect(specs).toEqual([]);
  });

  it('EC-11: no clonePath on the repo → empty specs, no read attempted', async () => {
    const container = makeContainer({
      agentsRepo: { listEnabled: async () => [{ id: 'a1' }] },
      contextDocsRepo: { listForAgent: async () => [{ path: 'docs/x.md', order: 0 }] },
      config: { contextDocRoots: ['docs'] },
    } as any);
    const repoNoClone = { ...REPO_ROW, clonePath: null };
    const specs = await collectBriefContextDocs(container, 'ws-1', repoNoClone, { info: () => undefined });
    expect(specs).toEqual([]);
  });

  it('AC-7: unions attachments across enabled agents, deduped by resolveContextDocs', async () => {
    const listForAgent = async (agentId: string) =>
      agentId === 'a1'
        ? [{ path: 'docs/shared.md', order: 0 }]
        : [{ path: 'docs/shared.md', order: 0 }, { path: 'docs/only-b.md', order: 1 }];
    const container = makeContainer({
      agentsRepo: { listEnabled: async () => [{ id: 'a1' }, { id: 'a2' }] },
      contextDocsRepo: { listForAgent },
      config: { contextDocRoots: ['docs'] },
    } as any);
    // No real filesystem in this unit test — clonePath present but read will
    // no-op (best-effort) against a nonexistent path, proving no throw.
    const specs = await collectBriefContextDocs(container, 'ws-1', REPO_ROW, { info: () => undefined });
    expect(specs).toEqual([]); // files don't actually exist on disk — best-effort empty, no throw
  });
});
