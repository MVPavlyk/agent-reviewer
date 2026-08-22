import { z } from 'zod';

/**
 * Project context docs — UI-only subset mirrored from
 * `server/src/vendor/shared/contracts/context-docs.ts` (source of truth).
 * `SetContextDocsBody` is a server-side validation schema and is
 * deliberately NOT mirrored here — the client sends a plain object.
 */

/**
 * `dir_type` is typed as `z.string()`, not an enum — the search roots are
 * configurable (`CONTEXT_DOC_ROOTS`), so an enum would go stale. See the
 * server copy for the full rationale.
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
 * through an enabled skill of the agent and never have a detach control on
 * the client (SPEC-02 AC-33).
 *
 * `source: 'agent'` means a DIRECT attachment by the resource's own owner —
 * NOT literally "attached to an agent". Every row from
 * `GET /skills/:id/context-docs` is therefore always `'agent'`. This is what
 * `ContextDocPicker`'s filter depends on — do not "fix" it to `'skill'`, it
 * would break with no type error.
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
