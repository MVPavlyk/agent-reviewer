import { z } from 'zod';
import type { ReviewRecord, ReviewRunResponse, RunSummary } from '@devdigest/shared';
import { api } from '../client.js';
import {
  fromApiError,
  noRunStartedError,
  prNotFoundError,
  runFailedError,
  runTimeoutError,
  McpToolError,
} from '../errors.js';
import { RunResultSummary } from '../schemas.js';
import { resolveAgent, resolvePr, resolveRepo } from '../resolvers.js';

export const runAgentOnPullRequestInputShape = {
  repo: z.string().describe('owner/repo, e.g. "acme/widgets"'),
  pr: z.number().int().describe('the PR number on GitHub'),
  agent: z.string().describe('agent name or id — required, no "run all agents" mode'),
};

const RunAgentInput = z.object(runAgentOnPullRequestInputShape);
type RunAgentInput = z.infer<typeof RunAgentInput>;

/* POST /pulls/:id/review returns immediately with `runs` and an EMPTY `reviews`
   — the run is queued, not synchronous (the contract's "once the run completes"
   comment describes an intent the route never had). So we poll the run history
   until the run row reaches a terminal status, then read the persisted review.
   Observed durations: ~16s for a small agent, ~250s for a heavy one, hence the
   generous default timeout. */
const TERMINAL_STATUSES = new Set(['done', 'failed', 'cancelled']);
const POLL_INTERVAL_MS = numFromEnv('DEVDIGEST_RUN_POLL_INTERVAL_MS', 2_000);
const RUN_TIMEOUT_MS = numFromEnv('DEVDIGEST_RUN_TIMEOUT_MS', 300_000);
/** A single failed poll is a blip; several in a row means the API went away. */
const MAX_CONSECUTIVE_POLL_FAILURES = 3;

function numFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function runAgentOnPullRequest(input: RunAgentInput) {
  const repo = await resolveRepo(input.repo);
  const pr = await resolvePr(repo.id, input.pr, input.repo);
  if (!pr.id) throw prNotFoundError(input.pr, input.repo);
  const agent = await resolveAgent(input.agent);

  let response: ReviewRunResponse;
  try {
    response = await api.post<ReviewRunResponse>(`/pulls/${pr.id}/review`, {
      agentId: agent.id,
    });
  } catch (err) {
    throw fromApiError(err);
  }

  // Fast path: if the route ever does return the review inline, use it.
  const inline = response.reviews.find((r) => r.agent_id === agent.id);
  if (inline) return toSummary(inline);

  const target = response.runs.find((r) => r.agent_id === agent.id) ?? response.runs[0];
  if (!target) throw noRunStartedError(input.agent);

  const finished = await waitForRun(pr.id, target.run_id, input.agent);
  if (finished.status !== 'done') {
    throw runFailedError(input.agent, finished.status ?? 'unknown', finished.error);
  }

  let reviews: ReviewRecord[];
  try {
    reviews = await api.get<ReviewRecord[]>(`/pulls/${pr.id}/reviews`);
  } catch (err) {
    throw fromApiError(err);
  }

  const review =
    reviews.find((r) => r.run_id === target.run_id) ??
    reviews.find((r) => r.agent_id === agent.id);
  if (!review) {
    throw new McpToolError(
      'no_review_returned',
      `Run ${target.run_id} for agent '${input.agent}' finished as 'done' but persisted no review. Inspect it at GET /runs/${target.run_id}/trace.`,
      false,
    );
  }
  return toSummary(review);
}

/** Polls the PR's run history until `runId` reaches a terminal status. */
async function waitForRun(prId: string, runId: string, agentLabel: string): Promise<RunSummary> {
  const startedAt = Date.now();
  let consecutiveFailures = 0;
  let lastError: unknown;

  while (Date.now() - startedAt < RUN_TIMEOUT_MS) {
    await sleep(POLL_INTERVAL_MS);

    let runs: RunSummary[];
    try {
      runs = await api.get<RunSummary[]>(`/pulls/${prId}/runs`);
      consecutiveFailures = 0;
    } catch (err) {
      lastError = err;
      if (++consecutiveFailures >= MAX_CONSECUTIVE_POLL_FAILURES) throw fromApiError(err);
      continue;
    }

    // A run row missing from the history is a write race, not an outcome — keep
    // waiting rather than reporting a failure that did not happen.
    const run = runs.find((r) => r.run_id === runId);
    if (run?.status && TERMINAL_STATUSES.has(run.status)) return run;
  }

  if (consecutiveFailures > 0 && lastError) throw fromApiError(lastError);
  throw runTimeoutError(agentLabel, Date.now() - startedAt);
}

function toSummary(review: ReviewRecord): RunResultSummary {
  return RunResultSummary.parse({
    verdict: review.verdict,
    findings: review.findings.map((f) => ({
      severity: f.severity,
      title: f.title,
      file: f.file,
      start_line: f.start_line,
      end_line: f.end_line,
      rationale: f.rationale,
      suggestion: f.suggestion,
    })),
  });
}
