/* resolvers.ts — the ONLY place that calls GET /repos, GET /repos/:id/pulls,
   or GET /agents. Every tool handler resolves human-friendly identifiers
   (owner/repo, PR number, agent name) to internal ids through these
   functions — never inline a raw GET call in a tools/*.ts file. */

import type { Agent, PrMeta, Repo } from '@devdigest/shared';
import { api } from './client.js';
import { agentNotFoundError, prNotFoundError, repoNotFoundError } from './errors.js';

export async function resolveRepo(repoFullName: string): Promise<Repo> {
  const repos = await api.get<Repo[]>('/repos');
  const match = repos.find((r) => r.full_name === repoFullName);
  if (!match) throw repoNotFoundError(repoFullName);
  return match;
}

export async function resolvePr(repoId: string, prNumber: number, repo: string): Promise<PrMeta> {
  const pulls = await api.get<PrMeta[]>(`/repos/${repoId}/pulls`);
  const match = pulls.find((p) => p.number === prNumber);
  if (!match) throw prNotFoundError(prNumber, repo);
  return match;
}

export async function resolveAgent(agentNameOrId: string): Promise<Agent> {
  const agents = await api.get<Agent[]>('/agents');
  const match = agents.find((a) => a.id === agentNameOrId || a.name === agentNameOrId);
  if (!match) throw agentNotFoundError(agentNameOrId);
  return match;
}
