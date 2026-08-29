/**
 * context-docs clone reader (SPEC-01 AC-1..AC-4, AC-8, AC-10, EC-15, 30-plan.md
 * Крок 4). Walks the configured roots under a repo's clone and returns every
 * `.md` file found, mirroring repo-intel's `pipeline/walk.ts` filters
 * (symlinks never followed, MAX_FILE_SIZE, MAX_INDEXED_FILES).
 *
 * Pure I/O on the filesystem — no DB, no HTTP. `used_by_agents` (which needs
 * the DB) is attached by the service, not here. The Tokenizer is passed in by
 * the caller (Onion: the interface lives with the consumer, the adapter comes
 * from the rim via `container.tokenizer`), as does the optional `tokenCache`
 * — a cross-call cache keyed by `content_hash` so re-scanning an unchanged
 * file never re-invokes `tokenizer.count()` (AC-10). The service owns the
 * Map's lifetime; a fresh scan (`refresh`) can pass a cleared one.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative, sep } from 'node:path';
import type { Tokenizer } from '../../adapters/tokenizer/index.js';
import { MAX_FILE_SIZE, MAX_INDEXED_FILES } from './constants.js';

/**
 * One `.md` file found under a configured root, before `used_by_agents` is
 * merged in by the service — that field needs the DB, which this module
 * never touches.
 */
export interface ScannedContextDoc {
  path: string;
  dir_type: string;
  size_bytes: number;
  tokens: number;
  content_hash: string;
  excluded_reason: 'too_large' | null;
}

export async function scanContextDocs(
  clonePath: string,
  roots: string[],
  tokenizer: Tokenizer,
  tokenCache: Map<string, number> = new Map(),
): Promise<ScannedContextDoc[]> {
  const out: ScannedContextDoc[] = [];
  for (const root of roots) {
    await walkDir(clonePath, root, join(clonePath, root), out, tokenizer, tokenCache);
  }

  // Stable order: alphabetical relpath (AC-5), same convention as walk.ts.
  out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  // EC-15: bound the combined result, same "first N by sorted order" contract
  // as repo-intel's walkClone — reproducible across runs.
  if (out.length > MAX_INDEXED_FILES) out.length = MAX_INDEXED_FILES;

  return out;
}

async function walkDir(
  clonePath: string,
  dirType: string,
  dir: string,
  out: ScannedContextDoc[],
  tokenizer: Tokenizer,
  tokenCache: Map<string, number>,
): Promise<void> {
  let entries: Dirent[];
  try {
    entries = (await readdir(dir, { withFileTypes: true })) as Dirent[];
  } catch {
    // Root doesn't exist in this clone (or an unreadable dir further down) —
    // not an error; a clone with no `docs/` just contributes nothing (EC-2).
    return;
  }

  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue; // AC-3: never follow symlinks (file or dir)
    const full = join(dir, entry.name);

    if (entry.isDirectory()) {
      await walkDir(clonePath, dirType, full, out, tokenizer, tokenCache);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!entry.name.toLowerCase().endsWith('.md')) continue;

    let size: number;
    try {
      size = (await stat(full)).size;
    } catch {
      continue; // vanished between readdir and stat
    }

    const rel = relative(clonePath, full).split(sep).join('/');

    if (size > MAX_FILE_SIZE) {
      // AC-4: stays in the list, excluded — but never read a large file's
      // content just to hash it. Fingerprint from metadata only.
      out.push({
        path: rel,
        dir_type: dirType,
        size_bytes: size,
        tokens: 0,
        content_hash: createHash('sha256').update(`${rel}:${size}`).digest('hex'),
        excluded_reason: 'too_large',
      });
      continue;
    }

    let content: string;
    try {
      content = await readFile(full, 'utf8');
    } catch {
      continue; // vanished, or unreadable — skip cleanly
    }

    const contentHash = createHash('sha256').update(content).digest('hex');
    let tokens = tokenCache.get(contentHash);
    if (tokens === undefined) {
      tokens = tokenizer.count(content);
      tokenCache.set(contentHash, tokens);
    }

    out.push({
      path: rel,
      dir_type: dirType,
      size_bytes: size,
      tokens,
      content_hash: contentHash,
      excluded_reason: null,
    });
  }
}
