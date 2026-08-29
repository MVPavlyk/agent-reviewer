import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { SetContextDocsBody } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { ContextDocsService } from './service.js';

/**
 * context-docs module (SPEC-01 + SPEC-02, 30-plan.md Крок 6).
 *   GET  /repos/:repoId/context-docs          → scanned .md docs + used_by_agents
 *   POST /repos/:repoId/context-docs/refresh  → invalidate the scan cache, rescan
 *   GET  /repos/:repoId/context-docs/content  → preview one doc's content (truncated)
 *   GET  /agents/:id/context-docs             → own + inherited (source:'skill') links
 *   POST /agents/:id/context-docs             → replace the agent's OWN attachments
 *   GET  /skills/:id/context-docs             → a skill's own links
 *   POST /skills/:id/context-docs             → replace a skill's attachments
 */

const RepoParams = z.object({ repoId: z.string().uuid() });
const ContentQuery = z.object({ path: z.string().min(1) });

export default async function contextDocsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new ContextDocsService(app.container);

  app.get('/repos/:repoId/context-docs', { schema: { params: RepoParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.listDocs(workspaceId, req.params.repoId);
  });

  app.post(
    '/repos/:repoId/context-docs/refresh',
    { schema: { params: RepoParams } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.refreshDocs(workspaceId, req.params.repoId);
    },
  );

  app.get(
    '/repos/:repoId/context-docs/content',
    { schema: { params: RepoParams, querystring: ContentQuery } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.getContent(workspaceId, req.params.repoId, req.query.path);
    },
  );

  app.get('/agents/:id/context-docs', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const links = await service.agentLinks(workspaceId, req.params.id);
    if (!links) throw new NotFoundError('Agent not found');
    return links;
  });

  app.post(
    '/agents/:id/context-docs',
    { schema: { params: IdParams, body: SetContextDocsBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const links = await service.setAgentLinks(workspaceId, req.params.id, req.body.paths);
      if (!links) throw new NotFoundError('Agent not found');
      return links;
    },
  );

  app.get('/skills/:id/context-docs', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const links = await service.skillLinks(workspaceId, req.params.id);
    if (!links) throw new NotFoundError('Skill not found');
    return links;
  });

  app.post(
    '/skills/:id/context-docs',
    { schema: { params: IdParams, body: SetContextDocsBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const links = await service.setSkillLinks(workspaceId, req.params.id, req.body.paths);
      if (!links) throw new NotFoundError('Skill not found');
      return links;
    },
  );
}
