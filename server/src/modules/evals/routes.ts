import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { EvalsService } from './service.js';

/**
 * evals module (L-06 eval pipeline).
 *   POST /findings/:id/eval-case          → turn a resolved finding into an eval case
 *                                             owned by the review's agent (idempotent)
 *   POST /agents/:id/eval-runs {label?}   → start a batch ("run all evals"); returns
 *                                             immediately with batch_id + status='running'
 *   GET  /agents/:id/eval-cases           → this agent's eval cases + each one's last run
 *   GET  /agents/:id/eval-runs            → this agent's batches, newest first
 *   GET  /eval-runs/:batchId              → one batch (poll-friendly: status + aggregates
 *                                             + how many cases have a row yet)
 *   GET  /eval-runs/compare?a=&b=         → both batch snapshots + a per-case comparison row
 *   GET  /evals/dashboard                 → one row per agent with ≥1 eval case: its
 *                                             latest batch (or null) + cases_total
 */

/**
 * Empty POST body from the "Run all evals" CTA must be valid. A body-less
 * `inject`/fetch request arrives here as `null` (not `undefined`) —
 * `z.object(...).default({})` only substitutes on `undefined`, so it still
 * 422s a `null` body. `preprocess` normalizes both to `{}` first
 * (server/INSIGHTS.md 2026-08-23).
 */
const StartBatchRequest = z.preprocess((v) => v ?? {}, z.object({ label: z.string().nullish() }));

const CompareQuery = z.object({ a: z.string().uuid(), b: z.string().uuid() });

export default async function evalsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new EvalsService(app.container);

  app.post('/findings/:id/eval-case', { schema: { params: IdParams } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    const result = await service.createCaseFromFinding(workspaceId, req.params.id);
    reply.status(result.created ? 201 : 200);
    return { case_id: result.caseId };
  });

  // Tight per-route limit: each call fans out to a full sequential batch of
  // (potentially many) LLM calls — same shape as /pulls/:id/intent (OQ-2).
  app.post(
    '/agents/:id/eval-runs',
    { schema: { params: IdParams, body: StartBatchRequest }, config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const result = await service.startBatch(workspaceId, req.params.id, req.body.label ?? null, req.log);
      return { batch_id: result.batchId, status: result.status };
    },
  );

  app.get('/agents/:id/eval-cases', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.getAgentEvalCases(workspaceId, req.params.id);
  });

  app.get('/agents/:id/eval-runs', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.getAgentEvalBatches(workspaceId, req.params.id);
  });

  app.get('/eval-runs/:batchId', { schema: { params: z.object({ batchId: z.string().uuid() }) } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.getBatch(workspaceId, req.params.batchId);
  });

  app.get('/eval-runs/compare', { schema: { querystring: CompareQuery } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.compareBatches(workspaceId, req.query.a, req.query.b);
  });

  app.get('/evals/dashboard', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.dashboard(workspaceId);
  });
}
