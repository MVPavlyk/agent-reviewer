/**
 * Run-time reader for the project-context docs a review actually sends to the
 * model (SPEC-01 AC-23..AC-33, EC-4..EC-8, EC-14, EC-17, 30-plan.md Крок 8).
 *
 * Pure I/O on the filesystem — no DB, no HTTP, no Drizzle/Fastify type. Takes
 * `resolveContextDocs`'s output and the clone path of the PR's OWN repo
 * (`pull.repoId` → `repos.clone_path`, never some other "current" repo —
 * A-1/EC-14) and turns it into the `specs` strings `reviewPullRequest` wants.
 *
 * Best-effort by design (30-plan.md §7 risk #9): nothing here ever throws for
 * a missing/unreadable/oversized/invalid-path/out-of-root document — each
 * such case is skipped with a Live Log line and the run continues (AC-26,
 * EC-4, EC-6, EC-7, EC-17). The path is re-validated with
 * `normalizeContextDocPath` before touching the disk, because it travelled
 * through the DB between the attach request and this read (NFR-2) — never
 * trust a stored path as-is. `roots` is likewise re-checked here (EC-17):
 * a doc attached while its root was configured must be skipped, not read,
 * once that root is removed from `CONTEXT_DOC_ROOTS` — the caller
 * (`run-executor.ts`) passes `container.config.contextDocRoots` in; this
 * rim-side reader never reaches into the container itself.
 */
import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { isUnderRoots, normalizeContextDocPath } from './helpers.js';
import { MAX_FILE_SIZE } from './constants.js';
import type { ResolvedContextDoc } from './resolve.js';

export interface ReadContextDocsLog {
  info: (msg: string) => void;
}

export interface ReadContextDocAttribution {
  path: string;
  contentHash: string;
  source: 'agent' | 'skill';
}

export interface ReadContextDocsForRunResult {
  /** `# <path>\n\n<content>` blocks, in resolved order — fed to `reviewPullRequest({ specs })` as-is (AC-25). */
  specs: string[];
  /** Paths actually read from disk, in the same order (AC-31). */
  specsRead: string[];
  /** One row per path actually read, for `insertRunContextDocs` (AC-34). */
  attributions: ReadContextDocAttribution[];
}

/**
 * Reads every doc in `resolved` from `clonePath`, formats the ones that have
 * content into `# <path>\n\n<content>` blocks (the header lives INSIDE the
 * block that `wrapUntrusted` later wraps — AC-25), and skips (with a log
 * line) anything that can't be read cleanly. An empty file is read (and
 * counted in `specsRead`/attribution) but contributes no block (EC-5).
 */
export async function readContextDocsForRun(
  clonePath: string,
  resolved: ResolvedContextDoc[],
  log: ReadContextDocsLog,
  roots: string[],
): Promise<ReadContextDocsForRunResult> {
  const specs: string[] = [];
  const specsRead: string[] = [];
  const attributions: ReadContextDocAttribution[] = [];

  for (const doc of resolved) {
    // NFR-2: the path sat in the DB between the attach request and this read
    // — re-validate before it ever reaches the filesystem.
    const normalized = normalizeContextDocPath(doc.path);
    if (!normalized) {
      log.info(`context docs: skipping "${doc.path}" — invalid path`);
      continue;
    }

    // EC-17: a root can be removed from CONTEXT_DOC_ROOTS after a doc was
    // attached under it — skip, never throw (AC-26/AC-28).
    if (!isUnderRoots(normalized, roots)) {
      log.info(`context docs: skipping "${normalized}" — outside configured roots`);
      continue;
    }

    const full = join(clonePath, normalized);
    let size: number;
    try {
      const st = await stat(full);
      if (!st.isFile()) {
        log.info(`context docs: skipping "${normalized}" — not a file`);
        continue;
      }
      size = st.size;
    } catch {
      // Missing (deleted since attach) or unreadable — best-effort skip,
      // never fails the run (AC-26, EC-6, EC-7, EC-17).
      log.info(`context docs: skipping "${normalized}" — not found`);
      continue;
    }

    if (size > MAX_FILE_SIZE) {
      // EC-4: grew past the limit after being attached — skip, don't throw.
      log.info(`context docs: skipping "${normalized}" — too large`);
      continue;
    }

    let content: string;
    try {
      content = await readFile(full, 'utf8');
    } catch {
      log.info(`context docs: skipping "${normalized}" — unreadable`);
      continue;
    }

    specsRead.push(normalized);
    attributions.push({
      path: normalized,
      contentHash: createHash('sha256').update(content).digest('hex'),
      source: doc.source,
    });

    // EC-5: an empty file is legitimately "read" (counted above) but forms
    // no separate prompt block.
    if (content.length === 0) continue;

    specs.push(`# ${normalized}\n\n${content}`);
  }

  if (specsRead.length > 0) {
    log.info(`context docs: ${specsRead.length} document(s) attached — ${specsRead.join(', ')}`);
  }

  return { specs, specsRead, attributions };
}
