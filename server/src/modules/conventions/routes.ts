import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { SkillType } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { ConventionsService } from './service.js';

/**
 * Conventions module — detect a connected repo's coding conventions and turn
 * accepted suggestions into a real skill (`source: 'extracted'`).
 *
 *   GET  /repos/:id/conventions                  → list + latest scan summary
 *   POST /repos/:id/conventions/rescan           → enqueue a detection job (202)
 *   POST /repos/:id/conventions/reset-accepted   → "Deselect all": bulk accepted→pending
 *   POST /conventions/:id/accept                 → mirrors POST /findings/:id/accept
 *   POST /conventions/:id/reject                 → mirrors POST /findings/:id/dismiss
 *   POST /conventions/skill-draft                → stateless merge preview (no row created)
 *   POST /conventions/create-skill               → merge accepted conventions into a real skill
 *
 * Job-handler registration lives here (mirrors repo-intel/routes.ts): this
 * plugin runs once at app boot and registers the DETECT_CONVENTIONS_JOB_KIND
 * handler so jobs enqueued by `rescan()` have a handler to run against.
 */

const ConventionIdsBody = z.object({ convention_ids: z.array(z.string().uuid()).min(1) });

const CreateSkillFromConventionsBody = z.object({
  convention_ids: z.array(z.string().uuid()).min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  type: SkillType,
  body: z.string().min(1),
});

export default async function conventionsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new ConventionsService(container);
  service.registerJobHandler();

  app.get('/repos/:id/conventions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.list(workspaceId, req.params.id);
  });

  app.post(
    '/repos/:id/conventions/rescan',
    { schema: { params: IdParams } },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      const result = await service.rescan(workspaceId, req.params.id);
      reply.code(202);
      return result;
    },
  );

  app.post(
    '/repos/:id/conventions/reset-accepted',
    { schema: { params: IdParams } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      const reset = await service.resetAccepted(workspaceId, req.params.id);
      return { reset };
    },
  );

  app.post('/conventions/:id/accept', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    const row = await service.accept(workspaceId, req.params.id);
    if (!row) throw new NotFoundError('Convention not found');
    return row;
  });

  app.post('/conventions/:id/reject', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    const row = await service.reject(workspaceId, req.params.id);
    if (!row) throw new NotFoundError('Convention not found');
    return row;
  });

  app.post(
    '/conventions/skill-draft',
    { schema: { body: ConventionIdsBody } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      const draft = await service.getSkillDraft(workspaceId, req.body.convention_ids);
      if (!draft) throw new NotFoundError('No matching conventions found');
      return draft;
    },
  );

  app.post(
    '/conventions/create-skill',
    { schema: { body: CreateSkillFromConventionsBody } },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      const skill = await service.createSkillFromConventions(workspaceId, req.body);
      reply.status(201);
      return skill;
    },
  );
}
