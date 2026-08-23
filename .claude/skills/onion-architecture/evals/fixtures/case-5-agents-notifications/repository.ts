import { db } from '../../db/client';
import { agents, agentRuns } from '../../db/schema';
import { and, eq } from 'drizzle-orm';

export interface AgentConfig {
  id: string;
  name: string;
  systemPrompt: string;
  notifyChannel: string;
}

export interface AgentRunRecord {
  id: string;
  agentId: string;
  owner: string;
  repo: string;
  pullNumber: number;
  summary: string;
}

export async function getAgentConfig(agentId: string): Promise<AgentConfig | undefined> {
  const [row] = await db.select().from(agents).where(eq(agents.id, agentId)).limit(1);
  return row;
}

export async function listActiveAgents(owner: string, repo: string) {
  return db
    .select()
    .from(agents)
    .where(and(eq(agents.owner, owner), eq(agents.repo, repo), eq(agents.active, true)));
}

export async function saveAgentRun(input: Omit<AgentRunRecord, 'id'>): Promise<AgentRunRecord> {
  const [row] = await db.insert(agentRuns).values(input).returning();
  return row;
}
