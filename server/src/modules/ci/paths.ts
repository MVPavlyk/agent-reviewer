/**
 * A4 — untrusted-input handling for the CI export bundle (SPEC-05 AC-10,
 * AC-20, EC-4). `repo` comes straight from the client wizard and is used to
 * key a persisted row (never interpolated into a shell command or a real
 * filesystem path here — this module is a pure renderer, see EC-8), so it is
 * validated defensively anyway. Skill/agent slugs are DERIVED by us (never
 * echoed from user input) via `slugify`, which only ever emits
 * `[a-z0-9-]` — but `safeRelativePath` is kept as a second, independent guard
 * so a future caller can't accidentally smuggle a `..` segment through.
 */

const REPO_PATTERN = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;

export class InvalidRepoError extends Error {
  constructor(repo: string) {
    super(`Invalid repo "${repo}" — expected "owner/name"`);
    this.name = 'InvalidRepoError';
  }
}

/** Reject anything that isn't a plausible `owner/name` GitHub slug (AC-20). */
export function assertValidRepo(repo: string): void {
  if (!REPO_PATTERN.test(repo)) {
    throw new InvalidRepoError(repo);
  }
}

/**
 * Split an already-`assertValidRepo`-checked "owner/name" string into the
 * `RepoRef` shape `GitHubClient` methods take (Pass 5 — PR creation). Callers
 * MUST validate with `assertValidRepo` first; this never touches a shell or a
 * filesystem path, only builds a plain object for the GitHub adapter.
 */
export function parseRepoRef(repo: string): { owner: string; name: string } {
  const [owner, name] = repo.split('/');
  return { owner: owner!, name: name! };
}

/**
 * Derive a filesystem/YAML-safe slug from a free-text name (agent/skill
 * name). Lowercases, strips diacritics, collapses anything outside
 * `[a-z0-9-]` into single hyphens, and trims leading/trailing hyphens. Falls
 * back to `fallback` when the result would otherwise be empty (EC-4).
 */
export function slugify(input: string, fallback: string): string {
  const base = input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base.length > 0 ? base : fallback;
}

/**
 * Slugify a list of names, de-duplicating collisions by appending `-2`,
 * `-3`, ... — two skills that slugify to the same base name must not
 * overwrite each other's `.devdigest/skills/<slug>.md` file.
 */
export function uniqueSlugs(names: string[], fallback: string): string[] {
  const seen = new Map<string, number>();
  return names.map((name) => {
    const base = slugify(name, fallback);
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base}-${count}`;
  });
}

/**
 * Join + normalize a relative path, rejecting `..`/absolute segments
 * (AC-10). Every `CiFile.path` goes through this before it's returned.
 */
export function safeRelativePath(...segments: string[]): string {
  const joined = segments.join('/').replace(/\\/g, '/');
  const parts = joined.split('/').filter((seg) => seg.length > 0 && seg !== '.');
  if (parts.some((seg) => seg === '..' || seg.includes(':'))) {
    throw new Error(`Unsafe path segment in "${joined}"`);
  }
  return parts.join('/');
}
