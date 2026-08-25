import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { MultiAgentService } from './service.js';

/**
 * multi-agent module (SPEC-05).
 *   POST /pulls/:id/multi-agent-run                 {agent_ids: uuid[]} → start a fan-out; returns MultiAgentRun (running)
 *   GET  /pulls/:id/multi-agent                                        → latest MultiAgentRun for the PR
 *   GET  /pulls/:id/multi-agent/:multiRunId                            → one specific MultiAgentRun
 *   GET  /agents/estimates?ids=...                                     → AgentEstimates pre-run estimate (D-6)
 *   GET  /multi-agent-runs?prId=...                                    → MultiAgentRunSummary[] history (L07)
 */
const StartMultiRunBody = z.object({
  agent_ids: z.array(z.string().uuid()).min(1),
});

const MultiRunParams = IdParams.extend({ multiRunId: z.string().uuid() });

const ListMultiRunsQuery = z.object({
  prId: z.string().uuid().optional(),
});

/** `ids` is a comma-separated list of agent uuids, e.g. `?ids=a,b,c`. */
const EstimateQuery = z.object({
  ids: z
    .string()
    .min(1)
    .transform((v) => v.split(',').map((s) => s.trim()))
    .pipe(z.array(z.string().uuid()).min(1)),
});

export default async function multiAgentRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new MultiAgentService(container);

  // ---- Start a multi-agent-run --------------------------------------------
  // Same rate-limit shape as POST /pulls/:id/review (AC-7): each call fans
  // out to N expensive LLM runs.
  app.post(
    '/pulls/:id/multi-agent-run',
    {
      schema: { params: IdParams, body: StartMultiRunBody },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.startMultiRun(workspaceId, req.params.id, req.body.agent_ids, req.log);
    },
  );

  // ---- Read: latest multi-agent-run for a PR -------------------------------
  app.get('/pulls/:id/multi-agent', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.readMultiRun(workspaceId, req.params.id);
  });

  // ---- Read: one specific multi-agent-run ----------------------------------
  app.get(
    '/pulls/:id/multi-agent/:multiRunId',
    { schema: { params: MultiRunParams } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.readMultiRun(workspaceId, req.params.id, req.params.multiRunId);
    },
  );

  // ---- Pre-run estimate (D-6) -----------------------------------------------
  app.get('/agents/estimates', { schema: { querystring: EstimateQuery } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.estimateAgents(workspaceId, req.query.ids);
  });

  // ---- Multi-agent run history (L07) -----------------------------------
  app.get('/multi-agent-runs', { schema: { querystring: ListMultiRunsQuery } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.listMultiRuns(workspaceId, req.query.prId);
  });
}
