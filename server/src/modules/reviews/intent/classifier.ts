import type { Container } from '../../../platform/container.js';
import { Intent, type IntentSource, type Provider } from '@devdigest/shared';
import { wrapUntrusted } from '../../../platform/prompt.js';
import { INTENT_SYSTEM_PROMPT } from './constants.js';
import type { IntentSourceBundle } from './sources.js';

/**
 * Intent Layer — the classifier LLM call. Mirrors the shape of
 * `conventions/service.ts`'s `container.llm(provider).completeStructured(...)`
 * call: a cheap, single-purpose structured-output request. The caller
 * (`intent/service.ts`) resolves `provider`/`model` via the per-feature model
 * registry (`review_intent`) BEFORE calling this — kept out of this function
 * so the "classification started" log line can report them up front.
 *
 * NEVER receives diff hunk bodies — only what `IntentSourceBundle` collected.
 */
export interface ClassifyIntentResult {
  intent: Intent;
  confidence: 'high' | 'low';
  sources: IntentSource[];
  missingContext: string[];
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
}

function buildUserContent(bundle: IntentSourceBundle): string {
  const sections: string[] = [`## PR title\n${wrapUntrusted('title', bundle.title)}`];

  if (bundle.description) {
    sections.push(`## PR description\n${wrapUntrusted('description', bundle.description)}`);
  }
  if (bundle.linkedIssue) {
    sections.push(
      `## Linked issue #${bundle.linkedIssue.number}: ${bundle.linkedIssue.title}\n` +
        wrapUntrusted('linked-issue', bundle.linkedIssue.body ?? ''),
    );
  }
  if (bundle.planDoc) {
    sections.push(`## Plan/spec doc (${bundle.planDoc.url})\n${wrapUntrusted('plan-doc', bundle.planDoc.text)}`);
  }
  const fileListText = bundle.fileList.map((f) => `- ${f.path} (+${f.additions}/-${f.deletions})`).join('\n');
  sections.push(`## Changed files\n${wrapUntrusted('file-list', fileListText)}`);
  sections.push(
    `## Diff hunk headers (structure only — no line content)\n` +
      wrapUntrusted('hunk-headers', bundle.hunkHeaders.join('\n')),
  );

  return sections.join('\n\n');
}

export async function classifyIntent(
  container: Container,
  provider: Provider,
  model: string,
  bundle: IntentSourceBundle,
): Promise<ClassifyIntentResult> {
  const llm = await container.llm(provider);

  const userContent = buildUserContent(bundle);

  const result = await llm.completeStructured<Intent>({
    model,
    schema: Intent,
    schemaName: 'Intent',
    temperature: 0.2,
    maxRetries: 2,
    messages: [
      { role: 'system', content: INTENT_SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
  });

  return {
    intent: result.data,
    // Rule #7 (Intent Layer plan): an empty PR description is the one input
    // whose absence always degrades confidence — other missing sources are
    // noted but don't by themselves make the classification untrustworthy.
    confidence: bundle.description ? 'high' : 'low',
    sources: bundle.sources,
    missingContext: bundle.missingContext,
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
    costUsd: result.costUsd,
  };
}

/** Exposed so the caller can log `promptChars` in the "started" line before
 *  the LLM call actually runs (composition, not a second render). */
export function intentPromptChars(bundle: IntentSourceBundle): number {
  return buildUserContent(bundle).length;
}
