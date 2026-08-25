import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { CiExportInput } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { CiService } from './service.js';

/**
 * A4 — CI module (owner A4, SPEC-05; ingest is Pass 6, ADDENDUM v2).
 *   POST /agents/:id/export-ci  → generate + (optionally) persist the CI bundle
 *   GET  /agents/:id/ci         → installations for one agent, with latest run status
 *   GET  /ci/runs               → CI runs across the workspace (read-only for THIS route)
 *   POST /ci/ingest             → authenticated CI-result ingest, dual-write
 *                                  (agent_runs + ci_runs) — the ONLY writer of
 *                                  either in this feature (ADDENDUM v2 decision 2,
 *                                  reverses SPEC-05 AC-18/D-6)
 *
 * `Fail CI on` has NO endpoint here (D-4) — it's changed via the existing
 * `PUT /agents/:id` (modules/agents).
 *
 * `/ci/ingest` is deliberately NOT workspace-session-scoped — it takes no
 * `getContext` call. The per-installation bearer token (Bearer
 * `DEVDIGEST_INGEST_TOKEN`, minted at export time — see `ingest-token.ts`) IS
 * the credential; workspace/agent identity is derived entirely from the
 * matched installation, never from the request body.
 */

// A body-less/`null` POST is normalized to `{}` before validation so a
// missing `repo` reports as a clean "required" 422 instead of "expected
// object, received null" (server/INSIGHTS.md 2026-08-23).
const ExportCiBody = z.preprocess((v) => v ?? {}, CiExportInput);

export default async function ciRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new CiService(app.container);

  app.post(
    '/agents/:id/export-ci',
    { schema: { params: IdParams, body: ExportCiBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const agent = await app.container.agentsRepo.getById(workspaceId, req.params.id);
      if (!agent) throw new NotFoundError('Agent not found');
      const links = await app.container.agentsRepo.linkedSkills(agent.id);

      req.log.info(
        { agentId: agent.id, repo: req.body.repo, target: req.body.target, action: req.body.action },
        'ci export requested',
      );

      const result = await service.exportCi(
        workspaceId,
        {
          id: agent.id,
          name: agent.name,
          provider: agent.provider,
          model: agent.model,
          systemPrompt: agent.systemPrompt,
          strategy: agent.strategy,
          ciFailOn: agent.ciFailOn,
        },
        links.map((l) => ({ name: l.skill.name, body: l.skill.body })),
        req.body,
      );

      req.log.info(
        { agentId: agent.id, repo: req.body.repo, filesCount: result.files.length },
        'ci export completed',
      );

      return result;
    },
  );

  app.get('/agents/:id/ci', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const agent = await app.container.agentsRepo.getById(workspaceId, req.params.id);
    if (!agent) throw new NotFoundError('Agent not found');
    return service.listInstallations(workspaceId, agent.id);
  });

  app.get('/ci/runs', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.listRuns(workspaceId);
  });

  // No `getContext`/session lookup here on purpose — see the module docstring.
  // No `schema.body` either: an invalid-schema body must still 401 (not 422)
  // when the token itself is bad, so `CiService.ingestResult` checks auth
  // BEFORE parsing the body; declaring a fastify body schema would validate
  // (and reject) the body during preValidation, before the handler runs.
  app.post('/ci/ingest', async (req) => {
    const result = await service.ingestResult({
      authorizationHeader: singleHeader(req.headers.authorization),
      commitShaHeader: singleHeader(req.headers['x-devdigest-commit-sha']),
      repositoryHeader: singleHeader(req.headers['x-devdigest-repository']),
      body: req.body,
    });
    // Never log/return anything beyond the two new row ids — no artifact
    // content, no headers, no token.
    req.log.info(result, 'ci result ingested');
    return { ok: true, ...result };
  });
}

/** Fastify types a header as `string | string[] | undefined` (repeated
 *  headers merge into an array). Only ever expect one value for these — take
 *  the first, or `undefined` if absent/empty. */
function singleHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
