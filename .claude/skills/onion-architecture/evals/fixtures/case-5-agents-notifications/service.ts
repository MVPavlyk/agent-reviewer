import type { Container } from '../../platform/container';
import { getAgentConfig, listActiveAgents, saveAgentRun } from './repository';
import type { NotificationSender } from '../../adapters/notifications/slack-adapter';
import { SlackNotificationSender } from '../../adapters/notifications/slack-adapter';
import { db } from '../../db/client';
import { agentRuns } from '../../db/schema';
import { eq } from 'drizzle-orm';

export interface AgentRunRequest {
  agentId: string;
  owner: string;
  repo: string;
  pullNumber: number;
}

export interface AgentRunResult {
  runId: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
}

export class AgentRunner {
  constructor(
    private readonly container: Container,
    private readonly notifications: NotificationSender,
  ) {}

  async startRun(request: AgentRunRequest): Promise<AgentRunResult> {
    const config = await getAgentConfig(request.agentId);
    if (!config) {
      throw new Error(`unknown agent: ${request.agentId}`);
    }

    const summary = await this.container.llmProvider.summarize({
      prompt: config.systemPrompt,
      context: `${request.owner}/${request.repo}#${request.pullNumber}`,
    });

    const run = await saveAgentRun({
      agentId: request.agentId,
      owner: request.owner,
      repo: request.repo,
      pullNumber: request.pullNumber,
      summary,
    });

    await this.notifications.send({
      channel: config.notifyChannel,
      text: `Agent ${config.name} started run ${run.id} on ${request.owner}/${request.repo}#${request.pullNumber}`,
    });

    return { runId: run.id, status: 'queued' };
  }

  async escalateFailure(runId: string, reason: string): Promise<void> {
    const [run] = await db.select().from(agentRuns).where(eq(agentRuns.id, runId)).limit(1);
    if (!run) {
      return;
    }

    const pager = new SlackNotificationSender({ channel: '#agent-incidents', urgent: true });
    await pager.send({ channel: '#agent-incidents', text: `Run ${runId} failed: ${reason}` });
  }

  async listActive(owner: string, repo: string): Promise<AgentRunResult[]> {
    const agents = await listActiveAgents(owner, repo);
    return agents.map((a) => ({ runId: a.lastRunId, status: a.status }));
  }
}
