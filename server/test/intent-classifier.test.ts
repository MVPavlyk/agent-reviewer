/**
 * Intent Layer — classifier pipeline WIRING tests (no DB, no real network).
 * Mirrors `conventions-detection.test.ts`'s stubbed-container style.
 *
 * The key acceptance proof from the plan: the classifier's LLM messages NEVER
 * contain diff hunk BODY content — only title/description/linked-issue/plan
 * doc/file-list/hunk HEADERS. Proven with a unique marker planted only in the
 * diff hunk body.
 */
import { describe, it, expect } from 'vitest';
import type { UnifiedDiff } from '@devdigest/shared';
import { MockLLMProvider } from '../src/adapters/index.js';
import type { Container } from '../src/platform/container.js';
import { collectIntentSources } from '../src/modules/reviews/intent/sources.js';
import { classifyIntent } from '../src/modules/reviews/intent/classifier.js';

const UNIQUE_DIFF_BODY_MARKER = 'ZZZ_DIFF_BODY_ONLY_9F3Q';

const DIFF: UnifiedDiff = {
  raw:
    'diff --git a/src/config.ts b/src/config.ts\n' +
    '--- a/src/config.ts\n' +
    '+++ b/src/config.ts\n' +
    '@@ -10,3 +10,4 @@\n' +
    '   port: 3000,\n' +
    `+  stripeKey: "${UNIQUE_DIFF_BODY_MARKER}",\n` +
    '   redisUrl: x,',
  files: [
    {
      path: 'src/config.ts',
      additions: 1,
      deletions: 0,
      hunks: [
        {
          file: 'src/config.ts',
          oldStart: 10,
          oldLines: 3,
          newStart: 10,
          newLines: 4,
          newLineNumbers: [10, 11, 12, 13],
        },
      ],
    },
  ],
};

const REPO_ROW = { owner: 'acme', name: 'payments-api' } as any;
const PULL_ROW = {
  id: 'pr-1',
  title: 'Add Stripe key rotation',
  body: 'Rotates the Stripe secret key used by the billing worker.',
  updatedAt: new Date('2024-01-01T00:00:00Z'),
} as any;

function makeContainer(llm: MockLLMProvider): Container {
  return {
    llm: async () => llm,
    github: async () => ({ getIssue: async () => ({ number: 1, title: 'n/a', body: null, state: 'open' }) }),
    docFetcher: { fetch: async () => ({ url: '', contentType: 'text/plain', text: '' }) },
  } as unknown as Container;
}

describe('Intent Layer classifier (no diff bodies reach the LLM)', () => {
  it('messages contain hunk HEADERS + file list, never the diff body/marker', async () => {
    const llm = new MockLLMProvider('openrouter', {
      structuredBySchema: {
        Intent: { summary: 'Rotates the Stripe key', in_scope: ['stripe key rotation'], out_of_scope: [] },
      },
    });
    const container = makeContainer(llm);

    const bundle = await collectIntentSources(container, REPO_ROW, PULL_ROW, DIFF);
    expect(bundle.hunkHeaders).toEqual(['src/config.ts @@ -10,3 +10,4 @@']);
    // The bundle itself never carries diff body text.
    expect(JSON.stringify(bundle)).not.toContain(UNIQUE_DIFF_BODY_MARKER);

    const result = await classifyIntent(container, 'openrouter', 'deepseek/deepseek-v4-flash', bundle);

    expect(result.intent.summary).toContain('Stripe');
    expect(llm.calls).toHaveLength(1);
    expect((llm.calls[0]!.req as { schemaName: string }).schemaName).toBe('Intent');

    const messages = (llm.calls[0]!.req as { messages: { content: string }[] }).messages;
    const allContent = messages.map((m) => m.content).join('\n');
    // Hard proof: the diff-body-only marker never made it into any message.
    expect(allContent).not.toContain(UNIQUE_DIFF_BODY_MARKER);
    // But the hunk HEADER (structure only) and the file path did.
    expect(allContent).toContain('@@ -10,3 +10,4 @@');
    expect(allContent).toContain('src/config.ts');
  });

  it('degrades gracefully: empty description → low confidence + missing_context note', async () => {
    const llm = new MockLLMProvider('openrouter', {
      structuredBySchema: {
        Intent: { summary: 'Unclear change', in_scope: [], out_of_scope: [] },
      },
    });
    const container = makeContainer(llm);
    const pullWithNoBody = { ...PULL_ROW, body: null };

    const bundle = await collectIntentSources(container, REPO_ROW, pullWithNoBody, DIFF);
    expect(bundle.sources).not.toContain('description');
    expect(bundle.missingContext).toContain('PR description is empty');

    const result = await classifyIntent(container, 'openrouter', 'deepseek/deepseek-v4-flash', bundle);
    expect(result.confidence).toBe('low');
  });
});
