import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { eq } from 'drizzle-orm';
import { RepoInput } from '@devdigest/shared';
import * as dbSchema from '../../db/schema.js';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { RepoService } from './service.js';

/**
 * F1 — repos module. Transport layer only: parses requests, maps status
 * codes, and delegates all business logic to RepoService.
 *   POST   /repos              → add repo (parse URL, persist, enqueue real clone)
 *   GET    /repos              → list repos (workspace-scoped)
 *   POST   /repos/:id/refresh  → re-fetch clone + bump last_polled_at
 *   DELETE /repos/:id          → remove repo
 *
 * The clone runs as a JobRunner job (kind 'clone') — real `git clone` via the
 * GitClient adapter into <cloneDir>/<owner>/<repo>.
 */
export default async function reposRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new RepoService(app.container);

  // Register the clone job handler once.
  service.registerCloneJobHandler();

  app.post('/repos', { schema: { body: RepoInput } }, async (req, reply) => {
    const { workspaceId, userId } = await getContext(app.container, req);
    const { repo, created } = await service.add(workspaceId, userId, req.body.url);
    reply.status(created ? 201 : 200);
    return repo;
  });

  app.get('/repos', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId);
  });

  app.post('/repos/:id/refresh', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.refresh(workspaceId, req.params.id);
  });

  // Quick read for the sync badge — goes straight to the table, no repository
  // round-trip, so the response stays a single query.
  app.get('/repos/:id/sync-state', { schema: { params: IdParams } }, async (req) => {
    const rows = await app.container.db
      .select({ lastPolledAt: dbSchema.repos.lastPolledAt })
      .from(dbSchema.repos)
      .where(eq(dbSchema.repos.id, req.params.id));
    return { last_synced_at: rows[0]?.lastPolledAt?.toISOString() ?? null };
  });

  app.delete('/repos/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    await service.remove(workspaceId, req.params.id);
    return { deleted: req.params.id };
  });
}
