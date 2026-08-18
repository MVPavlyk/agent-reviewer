/* tools/index.ts — aggregates the 5 tools: their MCP name, description, flat
   Zod input shape, annotations, and handler. src/index.ts registers each
   entry as-is against the McpServer; no tool-specific wiring lives there. */

import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import type { ZodRawShape } from 'zod';
import { listAgents, listAgentsInputShape } from './list-agents.js';
import {
  runAgentOnPullRequest,
  runAgentOnPullRequestInputShape,
} from './run-agent-on-pull-request.js';
import { getFindings, getFindingsInputShape } from './get-findings.js';
import { getConventions, getConventionsInputShape } from './get-conventions.js';
import { getBlastRadius, getBlastRadiusInputShape } from './get-blast-radius.js';

export interface ToolDef {
  name: string;
  description: string;
  inputShape: ZodRawShape;
  annotations: ToolAnnotations;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (args: any) => Promise<unknown>;
}

const READ_ONLY: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

export const toolDefs: ToolDef[] = [
  {
    name: 'list_agents',
    description: 'List the review agents configured in this DevDigest workspace.',
    inputShape: listAgentsInputShape,
    annotations: READ_ONLY,
    handler: async () => listAgents(),
  },
  {
    name: 'run_agent_on_pull_request',
    description:
      'Run one review agent against a pull request and return its verdict and findings. Blocks until the run completes (polls the run history; a heavy agent can take several minutes).',
    inputShape: runAgentOnPullRequestInputShape,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    handler: async (args) => runAgentOnPullRequest(args),
  },
  {
    name: 'get_findings',
    description:
      'Get the review findings already recorded for a pull request, optionally filtered by agent.',
    inputShape: getFindingsInputShape,
    annotations: READ_ONLY,
    handler: async (args) => getFindings(args),
  },
  {
    name: 'get_conventions',
    description: "Get a repo's detected coding conventions, filtered by status.",
    inputShape: getConventionsInputShape,
    annotations: READ_ONLY,
    handler: async (args) => getConventions(args),
  },
  {
    name: 'get_blast_radius',
    description:
      "Get a pull request's blast radius: changed symbols, their downstream callers, and the HTTP endpoints/cron jobs reachable through them.",
    inputShape: getBlastRadiusInputShape,
    annotations: READ_ONLY,
    handler: async (args) => getBlastRadius(args),
  },
];
