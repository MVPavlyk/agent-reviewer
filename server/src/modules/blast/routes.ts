import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { BlastRadius } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { BlastService } from './service.js';

/**
 * blast module — transport layer only. `:id` is the `pull_requests.id` uuid
 * (same convention as every other `/pulls/:id/*` route), not the PR number.
 * `IdParams` rejects a non-uuid with 422 before the handler runs — R7.
 *
 *   GET /pulls/:id/blast → BlastRadius (changed symbols, downstream impact,
 *                          coverage/status — never throws on a partial index,
 *                          only on an unknown PR).
 */
export default async function blastRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new BlastService(app.container);

  app.get('/pulls/:id/blast', { schema: { params: IdParams } }, async (req): Promise<BlastRadius> => {
    const { workspaceId } = await getContext(app.container, req);
    return service.getForPr(workspaceId, req.params.id);
  });
}
