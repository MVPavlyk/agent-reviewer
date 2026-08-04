import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { SkillSource, SkillType } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { SkillsService } from './service.js';

/**
 * A1 — skills module (owner A1).
 *   GET    /skills                              → list (workspace-scoped)
 *   GET    /skills/:id                          → one skill
 *   POST   /skills                              → create
 *   PUT    /skills/:id                          → update (bumps version on body change)
 *   DELETE /skills/:id                          → delete
 *   POST   /skills/import/preview                → extract a draft from a .md or .zip upload
 *   GET    /skills/:id/versions                  → body snapshots, newest first
 *   POST   /skills/:id/versions/:version/restore  → copy-forward restore (new version, never overwrite)
 *   GET    /skills/:id/stats                      → usage stats + findings-by-category (last 30d)
 */

const CreateSkillBody = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  type: SkillType,
  source: SkillSource,
  body: z.string().min(1),
  enabled: z.boolean().optional(),
  evidence_files: z.array(z.string()).optional(),
});

const UpdateSkillBody = z.object({
  name: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  type: SkillType.optional(),
  source: SkillSource.optional(),
  body: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
  evidence_files: z.array(z.string()).optional(),
  // User-entered summary of a body edit, snapshotted into skill_versions
  // (decision E3 — no LLM auto-summarization). Ignored when `body` doesn't change.
  change_summary: z.string().nullish(),
});

const ImportPreviewBody = z.object({
  filename: z.string().min(1),
  content_base64: z.string().min(1),
});

const VersionParams = z.object({ id: z.string().uuid(), version: z.coerce.number().int().positive() });

/**
 * Base64 inflates by 4/3, so a 4 MB budget accepts a ~3 MB archive. Every
 * other route keeps the app-wide 1 MB cap (`app.ts`) — this is the one
 * deliberate per-route override, for the one route that carries a file.
 */
const IMPORT_PREVIEW_BODY_LIMIT = 4_000_000;

export default async function skillsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new SkillsService(app.container);

  app.get('/skills', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId);
  });

  app.get('/skills/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const skill = await service.get(workspaceId, req.params.id);
    if (!skill) throw new NotFoundError('Skill not found');
    return skill;
  });

  app.post('/skills', { schema: { body: CreateSkillBody } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    const skill = await service.create(workspaceId, req.body);
    reply.status(201);
    return skill;
  });

  app.put(
    '/skills/:id',
    { schema: { params: IdParams, body: UpdateSkillBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const skill = await service.update(workspaceId, req.params.id, req.body);
      if (!skill) throw new NotFoundError('Skill not found');
      return skill;
    },
  );

  app.delete('/skills/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const ok = await service.delete(workspaceId, req.params.id);
    if (!ok) throw new NotFoundError('Skill not found');
    return { ok: true };
  });

  app.post(
    '/skills/import/preview',
    { bodyLimit: IMPORT_PREVIEW_BODY_LIMIT, schema: { body: ImportPreviewBody } },
    async (req) => {
      await getContext(app.container, req);
      return service.previewImport(req.body);
    },
  );

  app.get('/skills/:id/versions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const versions = await service.listVersions(workspaceId, req.params.id);
    if (!versions) throw new NotFoundError('Skill not found');
    return versions;
  });

  app.post(
    '/skills/:id/versions/:version/restore',
    { schema: { params: VersionParams } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const skill = await service.restoreVersion(workspaceId, req.params.id, req.params.version);
      if (!skill) throw new NotFoundError('Skill or version not found');
      return skill;
    },
  );

  app.get('/skills/:id/stats', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const stats = await service.getStats(workspaceId, req.params.id);
    if (!stats) throw new NotFoundError('Skill not found');
    return stats;
  });
}
