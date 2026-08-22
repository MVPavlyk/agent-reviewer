/**
 * Крок 4 — scanContextDocs unit tests. No DB, no HTTP. Builds a temp
 * clone-shaped dir on disk, runs the reader, asserts the filter set (AC-1,
 * AC-3, AC-4, AC-8, AC-10, EC-15) mirroring `indexer-walk.test.ts`'s style.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanContextDocs } from '../src/modules/context-docs/reader.js';
import { MAX_FILE_SIZE, MAX_INDEXED_FILES } from '../src/modules/repo-intel/constants.js';
import type { Tokenizer } from '../src/adapters/tokenizer/index.js';

async function writeFileAt(root: string, rel: string, contents: string): Promise<void> {
  const full = join(root, rel);
  const dir = full.slice(0, full.lastIndexOf('/'));
  if (dir && dir !== root) await mkdir(dir, { recursive: true });
  await writeFile(full, contents);
}

function fakeTokenizer(): Tokenizer & { count: ReturnType<typeof vi.fn> } {
  return { count: vi.fn((text: string) => text.length) };
}

describe('scanContextDocs', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'context-docs-reader-'));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('finds .md files under configured roots, sorted, with dir_type = root name', async () => {
    await writeFileAt(root, 'specs/b.md', 'B content');
    await writeFileAt(root, 'specs/a.md', 'A content');
    await writeFileAt(root, 'docs/nested/c.md', 'C content');
    await writeFileAt(root, 'insights/skipped.md', ''); // in a root not scanned below

    const tokenizer = fakeTokenizer();
    const docs = await scanContextDocs(root, ['specs', 'docs'], tokenizer);

    expect(docs.map((d) => d.path)).toEqual(['docs/nested/c.md', 'specs/a.md', 'specs/b.md']);
    expect(docs.every((d) => d.excluded_reason === null)).toBe(true);
    expect(docs.find((d) => d.path === 'specs/a.md')?.dir_type).toBe('specs');
    expect(docs.find((d) => d.path === 'docs/nested/c.md')?.dir_type).toBe('docs');
  });

  it('ignores non-.md files and files outside the configured roots', async () => {
    await writeFileAt(root, 'specs/notes.txt', 'text');
    await writeFileAt(root, 'other/outside.md', 'outside');
    await writeFileAt(root, 'specs/kept.md', 'kept');

    const docs = await scanContextDocs(root, ['specs', 'docs'], fakeTokenizer());
    expect(docs.map((d) => d.path)).toEqual(['specs/kept.md']);
  });

  it('never follows a symlinked file or directory (AC-3)', async () => {
    await writeFileAt(root, 'specs/real.md', 'real');
    await mkdir(join(root, 'outside'), { recursive: true });
    await writeFile(join(root, 'outside', 'target.md'), 'target');

    await symlink(join(root, 'outside', 'target.md'), join(root, 'specs', 'link.md'));
    await symlink(join(root, 'outside'), join(root, 'specs', 'link-dir'));

    const docs = await scanContextDocs(root, ['specs'], fakeTokenizer());
    expect(docs.map((d) => d.path)).toEqual(['specs/real.md']);
  });

  it('keeps a file over MAX_FILE_SIZE in the list, flagged too_large, tokens 0, content never hashed by reading it', async () => {
    const big = 'x'.repeat(MAX_FILE_SIZE + 1);
    await writeFileAt(root, 'specs/big.md', big);
    await writeFileAt(root, 'specs/small.md', 'small');

    const tokenizer = fakeTokenizer();
    const docs = await scanContextDocs(root, ['specs'], tokenizer);

    const bigDoc = docs.find((d) => d.path === 'specs/big.md');
    expect(bigDoc).toBeDefined();
    expect(bigDoc?.excluded_reason).toBe('too_large');
    expect(bigDoc?.tokens).toBe(0);
    expect(bigDoc?.size_bytes).toBe(big.length);

    const smallDoc = docs.find((d) => d.path === 'specs/small.md');
    expect(smallDoc?.excluded_reason).toBeNull();
    // Tokenizer was only invoked for the small (readable) file.
    expect(tokenizer.count).toHaveBeenCalledTimes(1);
    expect(tokenizer.count).toHaveBeenCalledWith('small');
  });

  it('an empty file gives tokens: 0 via the tokenizer, not a special case', async () => {
    await writeFileAt(root, 'specs/empty.md', '');
    const tokenizer: Tokenizer = { count: () => 0 };
    const docs = await scanContextDocs(root, ['specs'], tokenizer);
    expect(docs).toEqual([
      expect.objectContaining({ path: 'specs/empty.md', tokens: 0, excluded_reason: null }),
    ]);
  });

  it('uses the Tokenizer passed in (AC-8) rather than constructing its own', async () => {
    const tokenizer = fakeTokenizer();
    await writeFileAt(root, 'specs/one.md', 'hello world');
    const docs = await scanContextDocs(root, ['specs'], tokenizer);
    expect(tokenizer.count).toHaveBeenCalledWith('hello world');
    expect(docs[0]?.tokens).toBe('hello world'.length);
  });

  it('caches tokens by content_hash across calls when a tokenCache is shared (AC-10)', async () => {
    await writeFileAt(root, 'specs/one.md', 'unchanged content');
    const tokenizer = fakeTokenizer();
    const cache = new Map<string, number>();

    const first = await scanContextDocs(root, ['specs'], tokenizer, cache);
    expect(tokenizer.count).toHaveBeenCalledTimes(1);

    const second = await scanContextDocs(root, ['specs'], tokenizer, cache);
    // Same content_hash → no second tokenizer.count() call.
    expect(tokenizer.count).toHaveBeenCalledTimes(1);
    expect(second[0]?.content_hash).toBe(first[0]?.content_hash);
    expect(second[0]?.tokens).toBe(first[0]?.tokens);
  });

  it('re-tokenizes once content (and so content_hash) actually changes', async () => {
    await writeFileAt(root, 'specs/one.md', 'version 1');
    const tokenizer = fakeTokenizer();
    const cache = new Map<string, number>();

    await scanContextDocs(root, ['specs'], tokenizer, cache);
    expect(tokenizer.count).toHaveBeenCalledTimes(1);

    await writeFileAt(root, 'specs/one.md', 'version 2 — different length');
    await scanContextDocs(root, ['specs'], tokenizer, cache);
    expect(tokenizer.count).toHaveBeenCalledTimes(2);
  });

  it('bounds the result to MAX_INDEXED_FILES (documented ceiling, small-N sanity check)', async () => {
    const N = 12;
    for (let i = 0; i < N; i++) {
      await writeFileAt(root, `specs/f${String(i).padStart(2, '0')}.md`, 'x');
    }
    const docs = await scanContextDocs(root, ['specs'], fakeTokenizer());
    expect(docs.length).toBe(N);
    expect(MAX_INDEXED_FILES).toBe(5000);
  });

  it('a clone with no matching root contributes nothing, cleanly (EC-2 precursor)', async () => {
    await writeFileAt(root, 'src/index.ts', 'export {}');
    const docs = await scanContextDocs(root, ['specs', 'docs', 'insights'], fakeTokenizer());
    expect(docs).toEqual([]);
  });
});
