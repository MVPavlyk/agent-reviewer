import type { Container } from '../../../platform/container.js';
import { BriefCore, type Provider } from '@devdigest/shared';
import { wrapUntrusted } from '../../../platform/prompt.js';
import { BRIEF_PROMPT_MAX_CHARS, BRIEF_SYSTEM_PROMPT, MAX_PR_DESCRIPTION_CHARS } from './constants.js';
import type { BriefSourceBundle } from './sources.js';

/**
 * Brief Layer — the single structured LLM call. Mirrors
 * `intent/classifier.ts`'s shape: build user content from the (already
 * budget-truncated) bundle, one `completeStructured<BriefCore>` call, done.
 *
 * NEVER receives diff hunk bodies — only what `BriefSourceBundle` collected
 * (AC-6/N-1: no code path here reads `hunk.lines` or a patch body).
 */
export interface GenerateBriefResult {
  core: BriefCore;
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
  /** Length of the user-content actually sent (system prompt excluded — NFR-3).
   *  Whether the bundle was truncated is decided by the CALLER via
   *  `truncateBriefBundle`, before `generateBrief` is ever invoked (it's part
   *  of the "generation started" log line, logged before this call runs) —
   *  this result only reports what was actually sent. */
  promptChars: number;
}

const TRUNCATION_MARKER = '\n…[truncated]';

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function buildBriefUserContent(bundle: BriefSourceBundle): string {
  const sections: string[] = [`## PR title\n${wrapUntrusted('title', bundle.title)}`];

  if (bundle.description) {
    sections.push(
      `## PR description\n${wrapUntrusted('description', truncate(bundle.description, MAX_PR_DESCRIPTION_CHARS))}`,
    );
  }
  if (bundle.linkedIssue) {
    sections.push(
      `## Linked issue #${bundle.linkedIssue.number}\n` +
        wrapUntrusted(
          'linked-issue',
          `${bundle.linkedIssue.title}\n\n${truncate(bundle.linkedIssue.body ?? '', MAX_PR_DESCRIPTION_CHARS)}`,
        ),
    );
  }

  sections.push(
    `## Intent\n${wrapUntrusted(
      'intent',
      `${bundle.intent.summary}\nIn scope: ${bundle.intent.in_scope.join(', ')}\n` +
        `Out of scope: ${bundle.intent.out_of_scope.join(', ')}`,
    )}`,
  );

  const blastLines: string[] = [bundle.blast.summary];
  if (bundle.blastNotice) blastLines.push(`Note: ${bundle.blastNotice}`);
  for (const sym of bundle.blast.changed_symbols) blastLines.push(`- changed: ${sym.name} (${sym.file})`);
  for (const d of bundle.blast.downstream) {
    blastLines.push(`- downstream of ${d.symbol}:`);
    for (const c of d.callers) blastLines.push(`  - caller: ${c.name} (${c.file})`);
    for (const e of d.endpoints_affected) blastLines.push(`  - endpoint: ${e.value} (${e.file})`);
    for (const c of d.crons_affected) blastLines.push(`  - cron: ${c.value} (${c.file})`);
  }
  sections.push(`## Blast radius summary\n${wrapUntrusted('blast-radius', blastLines.join('\n'))}`);

  const fileListText = bundle.fileList.map((f) => `- ${f.path} (+${f.additions}/-${f.deletions})`).join('\n');
  sections.push(`## Changed files\n${wrapUntrusted('file-list', fileListText)}`);
  sections.push(
    `## Diff hunk headers (structure only — no line content)\n` +
      wrapUntrusted('hunk-headers', bundle.hunkHeaders.join('\n')),
  );

  if (bundle.specs.length > 0) {
    sections.push(`## Relevant project specs\n${wrapUntrusted('specs', bundle.specs.join('\n\n'))}`);
  }

  return sections.join('\n\n');
}

/** Exposed so the caller can log `promptChars` in the "started" line before
 *  the LLM call actually runs (composition, not a second render) — mirrors
 *  `intent/classifier.ts`'s `intentPromptChars`. */
export function briefPromptChars(bundle: BriefSourceBundle): number {
  return buildBriefUserContent(bundle).length;
}

export interface TruncateBriefBundleResult {
  bundle: BriefSourceBundle;
  truncated: boolean;
}

/**
 * Deterministic budget enforcement over the USER-CONTENT only (system prompt
 * excluded — NFR-3). Reduction order, each step only applied if the previous
 * ones weren't enough (AC-31): (1) drop specs entirely, (2) drop blast
 * callers, (3) drop changed-file-list entries (from the end), (4) drop hunk
 * headers (from the end). If the bundle is STILL over budget after all four
 * (a pathologically large single field — e.g. description/intent), the
 * description is tail-truncated with a `…[truncated]` marker as the last
 * resort.
 */
export function truncateBriefBundle(bundle: BriefSourceBundle): TruncateBriefBundleResult {
  const fits = (b: BriefSourceBundle) => briefPromptChars(b) <= BRIEF_PROMPT_MAX_CHARS;
  if (fits(bundle)) return { bundle, truncated: false };

  let out = bundle;

  // 1. specs
  if (!fits(out) && out.specs.length > 0) {
    out = { ...out, specs: [] };
  }

  // 2. blast callers (endpoints/crons are higher-signal — kept)
  if (!fits(out) && out.blast.downstream.some((d) => d.callers.length > 0)) {
    out = {
      ...out,
      blast: { ...out.blast, downstream: out.blast.downstream.map((d) => ({ ...d, callers: [] })) },
    };
  }

  // 3. changed-file list (drop from the end)
  while (!fits(out) && out.fileList.length > 0) {
    out = { ...out, fileList: out.fileList.slice(0, -1) };
  }

  // 4. hunk headers (drop from the end)
  while (!fits(out) && out.hunkHeaders.length > 0) {
    out = { ...out, hunkHeaders: out.hunkHeaders.slice(0, -1) };
  }

  // 5. last resort: tail-truncate whichever free-text field is still driving
  // the overflow, largest first — description, then intent.summary, then
  // blast.summary. Covers the pathological case where description is null
  // (nothing to trim there) but intent/blast prose alone is still oversized
  // (AC-30 must hold unconditionally, not just when a description exists).
  const clampField = (text: string): string => {
    const overBy = briefPromptChars(out) - BRIEF_PROMPT_MAX_CHARS;
    const newLen = Math.max(0, text.length - overBy - TRUNCATION_MARKER.length);
    return text.slice(0, newLen) + TRUNCATION_MARKER;
  };
  if (!fits(out) && out.description) {
    out = { ...out, description: clampField(out.description) };
  }
  if (!fits(out) && out.intent.summary) {
    out = { ...out, intent: { ...out.intent, summary: clampField(out.intent.summary) } };
  }
  if (!fits(out) && out.blast.summary) {
    out = { ...out, blast: { ...out.blast, summary: clampField(out.blast.summary) } };
  }

  return { bundle: out, truncated: true };
}

export async function generateBrief(
  container: Container,
  provider: Provider,
  model: string,
  bundle: BriefSourceBundle,
): Promise<GenerateBriefResult> {
  const llm = await container.llm(provider);
  const userContent = buildBriefUserContent(bundle);

  const result = await llm.completeStructured<BriefCore>({
    model,
    schema: BriefCore,
    schemaName: 'BriefCore',
    temperature: 0.2,
    maxRetries: 2,
    messages: [
      { role: 'system', content: BRIEF_SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
  });

  return {
    core: result.data,
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
    costUsd: result.costUsd,
    promptChars: userContent.length,
  };
}
