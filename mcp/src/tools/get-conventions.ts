import { z } from 'zod';
import type { ConventionsListResponse } from '@devdigest/shared';
import { api } from '../client.js';
import { fromApiError } from '../errors.js';
import { ConventionSummary } from '../schemas.js';
import { resolveRepo } from '../resolvers.js';

const StatusFilter = z.enum(['accepted', 'pending', 'rejected', 'all']);

export const getConventionsInputShape = {
  repo: z.string().describe('owner/repo, e.g. "acme/widgets"'),
  status: StatusFilter.optional().describe(
    'filter by convention status; defaults to "accepted"',
  ),
};

const GetConventionsInput = z.object(getConventionsInputShape);
type GetConventionsInput = z.infer<typeof GetConventionsInput>;

export async function getConventions(input: GetConventionsInput) {
  const repo = await resolveRepo(input.repo);
  const status = input.status ?? 'accepted';

  let response: ConventionsListResponse;
  try {
    response = await api.get<ConventionsListResponse>(`/repos/${repo.id}/conventions`);
  } catch (err) {
    throw fromApiError(err);
  }

  const filtered =
    status === 'all'
      ? response.conventions
      : response.conventions.filter((c) => c.status === status);

  const conventions: ConventionSummary[] = filtered.map((c) =>
    ConventionSummary.parse({
      title: c.title,
      rule: c.rule,
      status: c.status,
      evidence_path: c.evidence_path,
      confidence: c.confidence,
    }),
  );
  return { conventions };
}
