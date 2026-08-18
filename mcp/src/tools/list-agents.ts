import { z } from 'zod';
import type { Agent } from '@devdigest/shared';
import { api } from '../client.js';
import { AgentSummary } from '../schemas.js';

export const listAgentsInputShape = {};

export async function listAgents() {
  const agents = await api.get<Agent[]>('/agents');
  const summaries = agents.map((a): AgentSummary =>
    AgentSummary.parse({
      id: a.id,
      name: a.name,
      description: a.description,
      enabled: a.enabled,
      model: a.model,
    }),
  );
  return { agents: summaries };
}
