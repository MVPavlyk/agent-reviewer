import type { Container } from '../../../platform/container.js';
import type { PrBriefRecord } from '@devdigest/shared';
import type * as schema from '../../../db/schema.js';
import type { PullRow } from '../../../db/rows.js';
import type { ReviewRepository } from '../repository.js';
import { NotFoundError } from '../../../platform/errors.js';
import { resolveFeatureModel } from '../../settings/feature-models.js';
import { classifyAndStoreIntent } from '../intent/service.js';
import { loadDiff } from '../diff-loader.js';
import { BlastService } from '../../blast/service.js';
import { collectBriefContextDocs, collectBriefSources } from './sources.js';
import { briefPromptChars, generateBrief, truncateBriefBundle } from './classifier.js';
import { allowedRefs, groundBrief } from './grounding.js';

/** Minimal pino-compatible logger (mirrors `intent/service.ts`'s `IntentLogger`). */
export type BriefLogger = {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
};

/**
 * Brief Layer — the full generate-and-persist orchestration:
 *   getPull → (cache check, unless force) → getRepo → loadDiff → getIntent
 *   (classify if missing) → BlastService.getForPr → collectBriefSources +
 *   collectBriefContextDocs → truncateBriefBundle → generateBrief (LLM call
 *   #1, or #2 if intent had to be classified too) → allowedRefs + groundBrief
 *   → upsertBrief → read-after-write.
 *
 * Cache semantics (AC-23..AC-25, EC-5..EC-7): a brief is reused as-is when
 * `!force` AND the existing `source_updated_at` snapshot still matches
 * `pull.updatedAt` — ZERO LLM calls on a cache hit.
 */
export async function generateAndStoreBrief(
  container: Container,
  repo: ReviewRepository,
  workspaceId: string,
  prId: string,
  opts: { force?: boolean },
  logger?: BriefLogger,
): Promise<PrBriefRecord> {
  const start = Date.now();

  const pull = await repo.getPull(workspaceId, prId);
  if (!pull) throw new NotFoundError('Pull request not found');

  const pullUpdatedAt = pull.updatedAt ? pull.updatedAt.toISOString() : null;
  if (!opts.force) {
    const existing = await repo.getBrief(prId);
    if (existing && existing.source_updated_at === pullUpdatedAt) {
      return existing;
    }
  }

  const repoRow: typeof schema.repos.$inferSelect | undefined = await repo.getRepo(pull.repoId);
  if (!repoRow) throw new NotFoundError('Repo not found');

  const diff = await loadDiff(container, repo, workspaceId, pull, repoRow);

  let intentRecord = await repo.getIntent(prId);
  if (!intentRecord) {
    intentRecord = await classifyAndStoreIntent(container, repo, workspaceId, pull, repoRow, diff, logger);
  }
  const intent = { summary: intentRecord.summary, in_scope: intentRecord.in_scope, out_of_scope: intentRecord.out_of_scope };

  const blast = await new BlastService(container).getForPr(workspaceId, prId);

  const specs = await collectBriefContextDocs(container, workspaceId, repoRow, logger ?? { info: () => undefined });
  const sourceBundle = await collectBriefSources(container, repoRow, pull, diff, intent, blast, specs);
  const { bundle, truncated } = truncateBriefBundle(sourceBundle);

  const { provider, model } = await resolveFeatureModel(container, workspaceId, 'risk_brief');

  logger?.info(
    {
      prId,
      feature: 'risk_brief',
      provider,
      model,
      promptChars: briefPromptChars(bundle),
      truncated,
    },
    'brief: generation started',
  );

  const result = await generateBrief(container, provider, model, bundle);

  // AC-15/EC-8: ground against what actually reached the prompt — the
  // TRUNCATED bundle's file list and blast view, not the untruncated
  // `diff`/`blast` — otherwise a ref dropped by `truncateBriefBundle` could
  // still be treated as "allowed" even though the model never saw it.
  const allowed = allowedRefs({ files: bundle.fileList.map((f) => f.path), blast: bundle.blast });
  const { brief: grounded, droppedRefs } = groundBrief(result.core, allowed);

  await repo.upsertBrief(prId, {
    brief: { ...grounded, intent, blast },
    provider,
    model,
    sourceUpdatedAt: pull.updatedAt ?? null,
  });

  logger?.info(
    {
      prId,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      costUsd: result.costUsd,
      durationMs: Date.now() - start,
      riskLevel: grounded.risk_level,
      droppedRefs,
    },
    'brief: generation done',
  );

  const record = await repo.getBrief(prId);
  // upsertBrief just wrote this row — it is always readable-after-write here.
  if (!record) throw new Error('brief: upsert succeeded but the row could not be re-read');
  return record;
}
