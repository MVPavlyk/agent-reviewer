import { describe, it, expect } from 'vitest';
import type { BriefSourceBundle } from '../src/modules/reviews/brief/sources.js';
import { buildBriefUserContent } from '../src/modules/reviews/brief/classifier.js';
import { BRIEF_SYSTEM_PROMPT } from '../src/modules/reviews/brief/constants.js';

const DIFF_ADDED_LINE = '+  stripeKey: "sk_live_xxx",';
const DIFF_REMOVED_LINE = '-  port: 3000,';

function bundle(overrides: Partial<BriefSourceBundle> = {}): BriefSourceBundle {
  return {
    title: 'Rotate Stripe secret',
    description: 'Rotates the key used by the billing worker.',
    linkedIssue: { number: 12, title: 'Rotate key', body: 'Please rotate.', state: 'open' },
    intent: { summary: 'Rotates secret', in_scope: ['secret rotation'], out_of_scope: [] },
    blast: {
      summary: 'low impact',
      status: 'ok',
      reason: null,
      message: '',
      changed_symbols: [{ name: 'config', file: 'src/config.ts' }],
      downstream: [
        {
          symbol: 'config',
          callers: [{ file: 'src/server.ts', name: 'boot' }],
          endpoints_affected: [{ value: 'GET /health', file: 'src/routes.ts' }],
          crons_affected: [],
        },
      ],
    },
    fileList: [{ path: 'src/config.ts', additions: 1, deletions: 1 }],
    hunkHeaders: ['src/config.ts @@ -10,3 +10,4 @@'],
    specs: ['# specs/config.md\n\nConfig conventions.'],
    blastNotice: null,
    ...overrides,
  };
}

describe('brief/classifier — buildBriefUserContent (AC-6, N-1)', () => {
  it('never includes diff hunk BODY content — only headers', () => {
    const content = buildBriefUserContent(bundle());
    expect(content).not.toContain(DIFF_ADDED_LINE);
    expect(content).not.toContain(DIFF_REMOVED_LINE);
    expect(content).toContain('@@ -10,3 +10,4 @@');
  });
});

describe('brief/classifier — buildBriefUserContent (AC-8)', () => {
  it('wraps every external/untrusted section in <untrusted source="...">', () => {
    const content = buildBriefUserContent(bundle());
    for (const source of [
      'title',
      'description',
      'linked-issue',
      'intent',
      'blast-radius',
      'file-list',
      'hunk-headers',
      'specs',
    ]) {
      expect(content).toContain(`<untrusted source="${source}">`);
    }
    expect((content.match(/<\/untrusted>/g) ?? []).length).toBeGreaterThanOrEqual(8);
  });

  it('EC-11: omits the specs section entirely when there are none', () => {
    const content = buildBriefUserContent(bundle({ specs: [] }));
    expect(content).not.toContain('source="specs"');
  });
});

describe('brief/constants — BRIEF_SYSTEM_PROMPT (EC-12)', () => {
  it('instructs the model to treat untrusted content as data, never instructions', () => {
    expect(BRIEF_SYSTEM_PROMPT).toMatch(/never instructions|DATA to analyze/i);
    expect(BRIEF_SYSTEM_PROMPT).toMatch(/appears in the input/i);
  });
});
