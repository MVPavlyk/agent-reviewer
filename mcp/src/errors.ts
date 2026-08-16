/* errors.ts — structured tool-facing errors. Every one carries a forward-
   guidance message (principle 4 of the tool design): the text always names
   the next concrete step the caller should take, never a bare "not found". */

import { ApiError } from './client.js';

export interface ToolError {
  code: string;
  message: string;
  retryable: boolean;
}

export class McpToolError extends Error implements ToolError {
  code: string;
  retryable: boolean;
  constructor(code: string, message: string, retryable: boolean) {
    super(message);
    this.name = 'McpToolError';
    this.code = code;
    this.retryable = retryable;
  }
}

export function repoNotFoundError(repo: string): McpToolError {
  return new McpToolError(
    'repo_not_found',
    `No repo matches '${repo}'. Verify the exact owner/repo spelling (e.g. via 'gh repo view ${repo}').`,
    false,
  );
}

export function prNotFoundError(pr: number, repo: string): McpToolError {
  return new McpToolError(
    'pr_not_found',
    `PR #${pr} not found in ${repo}. Check the PR number, or the repo may not be synced into DevDigest yet.`,
    false,
  );
}

export function agentNotFoundError(agent: string): McpToolError {
  return new McpToolError(
    'agent_not_found',
    `No agent named '${agent}'. Call list_agents to see available agents.`,
    false,
  );
}

export function rateLimitedError(): McpToolError {
  return new McpToolError(
    'rate_limited',
    'Review runs are capped at 10/min; wait and retry.',
    true,
  );
}

export function noRunStartedError(agent: string): McpToolError {
  return new McpToolError(
    'no_run_started',
    `The API accepted the review request for agent '${agent}' but started no run. Check the agent is enabled (call list_agents) and that the API log shows no resolve error.`,
    false,
  );
}

export function runFailedError(agent: string, status: string, detail: string | null): McpToolError {
  return new McpToolError(
    'run_failed',
    `The review run for agent '${agent}' ended as '${status}'${detail ? `: ${detail}` : ''}. Check the run trace at GET /runs/:id/trace, then retry once the cause is fixed.`,
    false,
  );
}

export function runTimeoutError(agent: string, waitedMs: number): McpToolError {
  return new McpToolError(
    'run_timeout',
    `The review run for agent '${agent}' was still in flight after ${Math.round(waitedMs / 1000)}s. It is not cancelled — call get_findings for this PR in a minute to pick up the result, or raise DEVDIGEST_RUN_TIMEOUT_MS.`,
    true,
  );
}

export function noReviewsYetError(): { status: 'no_reviews'; message: string } {
  return {
    status: 'no_reviews',
    message: 'No completed runs for this PR yet. Call run_agent_on_pull_request first.',
  };
}

/** Maps a network/HTTP failure surfaced by client.ts into a McpToolError. */
export function fromApiError(err: unknown): McpToolError {
  if (err instanceof ApiError) {
    if (err.status === 429) return rateLimitedError();
    return new McpToolError(err.code ?? 'api_error', err.message, false);
  }
  if (err instanceof Error) {
    return new McpToolError('unknown_error', err.message, false);
  }
  return new McpToolError('unknown_error', String(err), false);
}
