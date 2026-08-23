import { describe, it, expect } from 'vitest';
import type { BriefSourceBundle } from '../src/modules/reviews/brief/sources.js';
import {
  briefPromptChars,
  buildBriefUserContent,
  truncateBriefBundle,
} from '../src/modules/reviews/brief/classifier.js';
import { BRIEF_PROMPT_MAX_CHARS, MAX_PR_DESCRIPTION_CHARS } from '../src/modules/reviews/brief/constants.js';

function baseBundle(overrides: Partial<BriefSourceBundle> = {}): BriefSourceBundle {
  return {
    title: 'Fix the thing',
    description: 'A short description.',
    linkedIssue: null,
    intent: { summary: 'Fixes the thing', in_scope: ['thing'], out_of_scope: [] },
    blast: {
      summary: 'low impact',
      status: 'ok',
      reason: null,
      message: '',
      changed_symbols: [],
      downstream: [],
    },
    fileList: [],
    hunkHeaders: [],
    specs: [],
    blastNotice: null,
    ...overrides,
  };
}

describe('brief/classifier — briefPromptChars (AC-30)', () => {
  it('measures the user-content length, not the system prompt', () => {
    const bundle = baseBundle();
    expect(briefPromptChars(bundle)).toBe(buildBriefUserContent(bundle).length);
  });
});

describe('brief/classifier — truncateBriefBundle (AC-31, EC-8)', () => {
  it('a 300-file bundle with specs + callers is reduced to fit the budget, in order', () => {
    const bundle = baseBundle({
      specs: Array.from({ length: 20 }, (_, i) => `# spec-${i}.md\n\n` + 'lorem ipsum '.repeat(80)),
      blast: {
        summary: 'wide impact',
        status: 'ok',
        reason: null,
        message: '',
        changed_symbols: Array.from({ length: 20 }, (_, i) => ({ name: `sym${i}`, file: `src/sym${i}.ts` })),
        downstream: [
          {
            symbol: 'sym0',
            callers: Array.from({ length: 100 }, (_, i) => ({ file: `src/caller${i}.ts`, name: `caller${i}` })),
            endpoints_affected: [],
            crons_affected: [],
          },
        ],
      },
      fileList: Array.from({ length: 300 }, (_, i) => ({ path: `src/file${i}.ts`, additions: 3, deletions: 1 })),
      hunkHeaders: Array.from({ length: 300 }, (_, i) => `src/file${i}.ts @@ -1,2 +1,3 @@`),
    });

    expect(briefPromptChars(bundle)).toBeGreaterThan(BRIEF_PROMPT_MAX_CHARS);

    const { bundle: out, truncated } = truncateBriefBundle(bundle);
    expect(truncated).toBe(true);
    expect(briefPromptChars(out)).toBeLessThanOrEqual(BRIEF_PROMPT_MAX_CHARS);

    // Order: specs go first — if the budget is reclaimed before later steps
    // run, they stay untouched. Specs were the first, biggest cut here.
    expect(out.specs).toEqual([]);
  });

  it('leaves an already-in-budget bundle untouched', () => {
    const bundle = baseBundle();
    const { bundle: out, truncated } = truncateBriefBundle(bundle);
    expect(truncated).toBe(false);
    expect(out).toEqual(bundle);
  });

  it('drops specs before callers before file list before hunk headers (AC-31 order)', () => {
    // Specs alone push it over budget; callers/file list/hunk headers stay
    // small enough that dropping specs alone should be sufficient.
    const bundle = baseBundle({
      specs: ['x'.repeat(BRIEF_PROMPT_MAX_CHARS + 500)],
      blast: {
        summary: 's',
        status: 'ok',
        reason: null,
        message: '',
        changed_symbols: [],
        downstream: [{ symbol: 'sym0', callers: [{ file: 'src/a.ts', name: 'a' }], endpoints_affected: [], crons_affected: [] }],
      },
      fileList: [{ path: 'src/a.ts', additions: 1, deletions: 0 }],
      hunkHeaders: ['src/a.ts @@ -1,1 +1,1 @@'],
    });
    const { bundle: out } = truncateBriefBundle(bundle);
    expect(out.specs).toEqual([]);
    // Later, smaller sections survive since dropping specs alone was enough.
    expect(out.blast.downstream[0]!.callers).toHaveLength(1);
    expect(out.fileList).toHaveLength(1);
    expect(out.hunkHeaders).toHaveLength(1);
  });

  it('AC-30: hard backstop — description:null but oversized intent/blast prose still fits unconditionally', () => {
    const bundle = baseBundle({
      description: null,
      intent: {
        summary: 'lorem ipsum '.repeat(2000),
        in_scope: ['thing'],
        out_of_scope: [],
      },
      blast: {
        summary: 'wide impact '.repeat(2000),
        status: 'ok',
        reason: null,
        message: '',
        changed_symbols: [],
        downstream: [],
      },
    });
    expect(briefPromptChars(bundle)).toBeGreaterThan(BRIEF_PROMPT_MAX_CHARS);

    const { bundle: out, truncated } = truncateBriefBundle(bundle);
    expect(truncated).toBe(true);
    expect(briefPromptChars(out)).toBeLessThanOrEqual(BRIEF_PROMPT_MAX_CHARS);
  });
});

describe('brief/classifier — buildBriefUserContent (AC-32)', () => {
  it('caps the PR description at MAX_PR_DESCRIPTION_CHARS regardless of prompt budget', () => {
    const longDescription = 'x'.repeat(MAX_PR_DESCRIPTION_CHARS + 1000);
    const bundle = baseBundle({ description: longDescription });
    const content = buildBriefUserContent(bundle);
    // The wrapped block contains the truncated description (+ 1 char for the
    // "…" marker `truncate()` appends), never the full untruncated text.
    expect(content).not.toContain(longDescription);
    expect(content).toContain('x'.repeat(MAX_PR_DESCRIPTION_CHARS));
  });
});
