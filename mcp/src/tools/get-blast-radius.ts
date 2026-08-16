import { z } from 'zod';

/* Stub — no REST call, no resolver use. Arguments are accepted now (so the
   real implementation won't need a signature change later) but ignored. */
export const getBlastRadiusInputShape = {
  repo: z.string().describe('owner/repo, e.g. "acme/widgets"'),
  pr: z.number().int().optional().describe('optional PR number (not yet used)'),
  file: z.string().optional().describe('optional file path (not yet used)'),
};

export async function getBlastRadius() {
  return {
    status: 'not_implemented' as const,
    message:
      'get_blast_radius is not implemented yet. Use get_findings or run_agent_on_pull_request for review results in the meantime.',
  };
}
