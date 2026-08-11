import type { Container } from '../../../platform/container.js';
import type { PrIntentRecord, UnifiedDiff } from '@devdigest/shared';
import type * as schema from '../../../db/schema.js';
import type { PullRow } from '../../../db/rows.js';
import type { ReviewRepository } from '../repository.js';
import { resolveFeatureModel } from '../../settings/feature-models.js';
import { collectIntentSources } from './sources.js';
import { classifyIntent, intentPromptChars } from './classifier.js';

/** Minimal pino-compatible logger (mirrors run-executor's `Logger`). */
export type IntentLogger = {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
};

function planDocStatus(sources: string[], missingContext: string[]): 'fetched' | 'unreachable' | 'none' {
  if (sources.includes('plan_doc')) return 'fetched';
  if (missingContext.some((m) => m.startsWith('plan doc '))) return 'unreachable';
  return 'none';
}

/**
 * Intent Layer — the full classify-and-persist orchestration: collect sources
 * → resolve the workspace's `review_intent` model → classify (LLM call #1,
 * always the cheap one) → upsert `pr_intent`. Used by BOTH the manual
 * `POST /pulls/:id/intent` route and `run-executor`'s lazy-auto path, so the
 * two structured log lines (`intent: classification started/done`) are
 * emitted exactly once per classification regardless of caller.
 *
 * Never throws for degraded inputs (empty description, unreachable plan doc,
 * unresolvable linked issue) — those degrade `confidence`/`sources`/
 * `missing_context` instead. It CAN throw on a hard failure (LLM call itself
 * failing) — callers decide whether that should fail the whole review
 * (it must not; see run-executor's lazy-auto try/catch).
 */
export async function classifyAndStoreIntent(
  container: Container,
  repo: ReviewRepository,
  workspaceId: string,
  pull: PullRow,
  repoRow: typeof schema.repos.$inferSelect,
  diff: UnifiedDiff,
  logger?: IntentLogger,
): Promise<PrIntentRecord> {
  const start = Date.now();
  const bundle = await collectIntentSources(container, repoRow, pull, diff);
  const { provider, model } = await resolveFeatureModel(container, workspaceId, 'review_intent');

  logger?.info(
    {
      prId: pull.id,
      feature: 'review_intent',
      provider,
      model,
      sources: bundle.sources,
      promptChars: intentPromptChars(bundle),
      planDoc: planDocStatus(bundle.sources, bundle.missingContext),
    },
    'intent: classification started',
  );

  const result = await classifyIntent(container, provider, model, bundle);

  logger?.info(
    {
      prId: pull.id,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      costUsd: result.costUsd,
      durationMs: Date.now() - start,
      confidence: result.confidence,
      inScope: result.intent.in_scope,
      outOfScope: result.intent.out_of_scope,
      missingContext: result.missingContext,
    },
    'intent: classification done',
  );

  await repo.upsertIntent(pull.id, {
    intent: result.intent,
    confidence: result.confidence,
    sources: result.sources,
    missingContext: result.missingContext,
    provider,
    model,
    sourceUpdatedAt: pull.updatedAt ?? null,
  });

  const record = await repo.getIntent(pull.id);
  // upsertIntent just wrote this row — it is always readable-after-write here.
  if (!record) throw new Error('intent: upsert succeeded but the row could not be re-read');
  return record;
}
