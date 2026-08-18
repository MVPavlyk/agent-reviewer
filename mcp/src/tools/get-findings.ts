import { z } from 'zod';
import type { ReviewRecord } from '@devdigest/shared';
import { api } from '../client.js';
import { fromApiError, noReviewsYetError, prNotFoundError } from '../errors.js';
import { ReviewSummary } from '../schemas.js';
import { resolveAgent, resolvePr, resolveRepo } from '../resolvers.js';

export const getFindingsInputShape = {
  repo: z.string().describe('owner/repo, e.g. "acme/widgets"'),
  pr: z.number().int().describe('the PR number on GitHub'),
  agent: z.string().optional().describe('optional agent name or id — filters to that agent'),
};

const GetFindingsInput = z.object(getFindingsInputShape);
type GetFindingsInput = z.infer<typeof GetFindingsInput>;

export async function getFindings(input: GetFindingsInput) {
  const repo = await resolveRepo(input.repo);
  const pr = await resolvePr(repo.id, input.pr, input.repo);
  if (!pr.id) throw prNotFoundError(input.pr, input.repo);

  let agentId: string | undefined;
  if (input.agent) {
    const agent = await resolveAgent(input.agent);
    agentId = agent.id;
  }

  let reviews: ReviewRecord[];
  try {
    reviews = await api.get<ReviewRecord[]>(`/pulls/${pr.id}/reviews`);
  } catch (err) {
    throw fromApiError(err);
  }

  if (agentId) {
    reviews = reviews.filter((r) => r.agent_id === agentId);
  }

  if (reviews.length === 0) {
    return noReviewsYetError();
  }

  const summaries: ReviewSummary[] = reviews.map((r) =>
    ReviewSummary.parse({
      agent: r.agent_name ?? null,
      verdict: r.verdict,
      score: r.score,
      findings: r.findings.map((f) => ({
        severity: f.severity,
        category: f.category,
        title: f.title,
        file: f.file,
        start_line: f.start_line,
        end_line: f.end_line,
        rationale: f.rationale,
        suggestion: f.suggestion,
      })),
    }),
  );
  return summaries;
}
