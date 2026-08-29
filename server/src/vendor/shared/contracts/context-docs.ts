import { z } from 'zod';

/**
 * Project context docs (SPEC-01 + SPEC-02). Users manually attach `.md`
 * documents scanned from a repo clone to an agent and/or a skill; the server
 * persists only PATH + ORDER (never `repo_id`, never content) and re-reads
 * the file from the PR's own clone at review time. See
 * `.devdigest/sdd/project-context/30-plan.md` §2 for the rationale behind
 * each deviation from the letter of SPEC-01.
 */

/**
 * `dir_type` is typed as `z.string()`, not an enum, even though SPEC-01 AC-5
 * lists three canonical values (`specs`, `docs`, `insights`). SPEC-01 AC-2
 * makes the search roots configurable via `CONTEXT_DOC_ROOTS`, so an enum
 * would go stale (or lie) the moment an operator adds a fourth root. The
 * value is always the top-level path segment under which the doc was found.
 */
export const ContextDocDirType = z.string();
export type ContextDocDirType = z.infer<typeof ContextDocDirType>;

export const ContextDocExcludedReason = z.enum(['too_large']).nullable();
export type ContextDocExcludedReason = z.infer<typeof ContextDocExcludedReason>;

/**
 * One `.md` file discovered under a configured root in a repo's clone.
 *
 * `tokens` is an APPROXIMATION — the tokenizer's own count, not a guaranteed
 * match for what any given provider will bill. Treat it as a budgeting
 * signal, never an exact figure (SPEC-01 AC-9).
 */
export const ContextDoc = z.object({
  path: z.string(),
  dir_type: ContextDocDirType,
  size_bytes: z.number().int().nonnegative(),
  /** Approximate token count from the configured tokenizer — see the note above. */
  tokens: z.number().int().nonnegative(),
  content_hash: z.string(),
  used_by_agents: z.number().int().nonnegative(),
  excluded_reason: ContextDocExcludedReason,
});
export type ContextDoc = z.infer<typeof ContextDoc>;

/** Response of `GET /repos/:repoId/context-docs` and its `/refresh` sibling. */
export const ContextDocsResponse = z.object({
  docs: z.array(ContextDoc),
  roots: z.array(z.string()),
  scanned_at: z.string(),
});
export type ContextDocsResponse = z.infer<typeof ContextDocsResponse>;

/** Response of `GET /repos/:repoId/context-docs/content`. */
export const ContextDocContent = z.object({
  path: z.string(),
  content: z.string(),
  truncated: z.boolean(),
});
export type ContextDocContent = z.infer<typeof ContextDocContent>;

/**
 * One resolved attachment as returned by `GET /agents/:id/context-docs` and
 * `GET /skills/:id/context-docs`. `source: 'skill'` rows are inherited
 * through an enabled skill of the agent and carry the skill's identity;
 * they never have a detach control on the client (SPEC-02 AC-33).
 *
 * `source: 'agent'` means a DIRECT attachment by the resource's own owner —
 * NOT literally "attached to an agent". Every row from
 * `GET /skills/:id/context-docs` is therefore always `'agent'` (a skill's own
 * list has no "inherited" concept to distinguish); do not "fix" that filter
 * to `'skill'`, it would silently break with no type error.
 */
export const ContextDocLink = z.object({
  path: z.string(),
  order: z.number().int(),
  source: z.enum(['agent', 'skill']),
  skill_id: z.string().optional(),
  skill_name: z.string().optional(),
  skill_enabled: z.boolean().optional(),
});
export type ContextDocLink = z.infer<typeof ContextDocLink>;

/** Body of `POST /agents/:id/context-docs` and `POST /skills/:id/context-docs`. */
export const SetContextDocsBody = z.object({
  paths: z.array(z.string()).max(500),
});
export type SetContextDocsBody = z.infer<typeof SetContextDocsBody>;
