import { z } from 'zod';
import type { BlastRadius } from '@devdigest/shared';
import { api } from '../client.js';
import { fromApiError, prNotFoundError } from '../errors.js';
import { BlastRadiusSummary } from '../schemas.js';
import { resolveRepo, resolvePr } from '../resolvers.js';

const MAX_CALLERS_PER_SYMBOL = 5;

/* blast is scoped to a PR (the changed files come from `pr_files`), so `pr`
   is required — unlike the earlier stub, there is no PR-less blast query on
   the server. `file` is dropped: the server route takes no file filter, and
   keeping an ignored optional arg in the schema would be a lie about what
   the tool actually accepts. */
export const getBlastRadiusInputShape = {
  repo: z.string().describe('owner/repo, e.g. "acme/widgets"'),
  pr: z.number().int().describe('PR number'),
};

const GetBlastRadiusInput = z.object(getBlastRadiusInputShape);
type GetBlastRadiusInput = z.infer<typeof GetBlastRadiusInput>;

export async function getBlastRadius(input: GetBlastRadiusInput): Promise<BlastRadiusSummary> {
  const repo = await resolveRepo(input.repo);
  const pr = await resolvePr(repo.id, input.pr, input.repo);
  // PrMeta.id is nullable — guard before using it as a path segment.
  if (!pr.id) throw prNotFoundError(input.pr, input.repo);

  let radius: BlastRadius;
  try {
    radius = await api.get<BlastRadius>(`/pulls/${pr.id}/blast`);
  } catch (err) {
    throw fromApiError(err);
  }

  const callersBySymbol = new Map(radius.downstream.map((d) => [d.symbol, d]));
  const symbols = radius.changed_symbols.map((s) => {
    const downstream = callersBySymbol.get(s.name);
    return {
      symbol: s.name,
      file: s.file,
      kind: s.kind,
      callers: (downstream?.callers ?? [])
        .slice(0, MAX_CALLERS_PER_SYMBOL)
        .map((c) => ({ file: c.file, line: c.line })),
      callers_total: downstream?.callers_total ?? 0,
      truncated: downstream?.callers_truncated ?? false,
    };
  });

  const endpoints = [...new Set(radius.downstream.flatMap((d) => d.endpoints_affected.map((e) => e.value)))];
  const crons = [...new Set(radius.downstream.flatMap((d) => d.crons_affected.map((c) => c.value)))];

  return BlastRadiusSummary.parse({
    status: radius.status,
    reason: radius.reason,
    message: radius.message,
    symbols,
    endpoints,
    crons,
    coverage: {
      changed_files: radius.coverage.changed_files,
      analyzed_files: radius.coverage.analyzed_files,
      unsupported_files: radius.coverage.unsupported_files,
    },
  });
}
