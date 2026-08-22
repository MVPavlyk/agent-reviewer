import { posix } from 'node:path';

/**
 * Validates and normalizes a user-supplied (or DB-stored) context-doc path
 * (SPEC-01 AC-16, NFR-2). This is the single security boundary against path
 * traversal for this module: it runs on the write path (`routes.ts`, before
 * a path is ever persisted) AND again on the read path (`read-for-run.ts`,
 * because a path that was valid when stored may not be re-validated by
 * anything else between requests).
 *
 * Rejects:
 *  - non-strings / empty strings
 *  - embedded NUL bytes
 *  - backslashes (this module's path domain is posix-only; a raw backslash
 *    is either a literal char that can't appear in a real repo-relative path
 *    or a Windows-style separator smuggling a traversal past a naive check)
 *  - absolute paths
 *  - any path that normalizes to (or through) a `..` segment
 *  - anything not ending in `.md` (case-insensitive)
 *
 * Returns the posix-normalized relative path, or `null` when invalid. Pure —
 * no I/O, no knowledge of whether the path actually exists on disk (SPEC-01
 * AC-19: attaching a nonexistent-but-valid path is allowed on purpose).
 */
export function normalizeContextDocPath(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  if (raw.includes('\0')) return null;
  if (raw.includes('\\')) return null;
  if (posix.isAbsolute(raw)) return null;

  const normalized = posix.normalize(raw);
  if (posix.isAbsolute(normalized)) return null;
  if (normalized === '.' || normalized.startsWith('..')) return null;
  if (normalized.split('/').includes('..')) return null;
  if (!normalized.toLowerCase().endsWith('.md')) return null;

  return normalized;
}

/**
 * Whether a normalized path (already run through `normalizeContextDocPath`)
 * falls under one of the configured `CONTEXT_DOC_ROOTS` (SPEC-01 AC-1,
 * EC-17). Pure — no I/O. Roots are single path segments (see
 * `config.ts`'s `isValidContextDocRoot` — never a multi-segment prefix or a
 * trailing slash), so "under a root" means the path's first segment matches
 * one exactly.
 *
 * Enforced in TWO places, both on the caller's side:
 *  - the write path (`service.ts`'s `setAgentLinks`/`setSkillLinks`) rejects
 *    with a 422 `ValidationError` — configured roots are not decorative.
 *  - the run-time read path (`read-for-run.ts`) skips the doc with a Live
 *    Log line and never throws (AC-26/AC-28) — a root removed from config
 *    after a doc was attached must not fail the run.
 */
export function isUnderRoots(path: string, roots: string[]): boolean {
  const [first] = path.split('/');
  return roots.includes(first ?? '');
}
