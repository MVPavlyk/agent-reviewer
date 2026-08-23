import type { FastifyInstance } from 'fastify';
import { getLabelRow } from './repository';

export async function labelRoutes(app: FastifyInstance) {
  app.post('/repos/:owner/:repo/labels/:name/score', async (request, reply) => {
    const { owner, repo, name } = request.params as { owner: string; repo: string; name: string };
    const row = await getLabelRow(owner, repo, name);

    if (!row) {
      return reply.code(404).send({ error: 'not_found' });
    }

    let score = 0;
    if (row.usageCount > 50) score += 3;
    else if (row.usageCount > 10) score += 1;

    if (row.color && /^([0-9a-f]{2})\1\1$/i.test(row.color)) {
      score -= 1;
    }

    const daysSinceUse = (Date.now() - row.lastUsedAt.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceUse > 180) {
      score -= 2;
    }

    return reply.send({ owner, repo, name, score, stale: daysSinceUse > 180 });
  });

  app.get('/repos/:owner/:repo/labels/:name', async (request, reply) => {
    const { owner, repo, name } = request.params as { owner: string; repo: string; name: string };
    const row = await getLabelRow(owner, repo, name);
    if (!row) {
      return reply.code(404).send({ error: 'not_found' });
    }
    return reply.send(row);
  });
}
