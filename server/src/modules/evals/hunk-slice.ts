import { parseUnifiedDiff } from '../../adapters/git/diff-parser.js';

/**
 * Slice the FULL text of every hunk in a single-file `pr_files.patch` body
 * whose new-side line numbers intersect `[startLine, endLine]`.
 *
 * `DiffHunk` (from `parseUnifiedDiff`) carries hunk *boundaries*
 * (`newStart`/`newLines`/`newLineNumbers`) but never the hunk's own text —
 * so this re-derives the boundaries via the shared parser (wrapping the bare
 * `patch` body the same way `diff-loader.ts#diffFromPrFiles` does) and then
 * independently splits the raw `patch` string on `@@ ... @@` headers to
 * recover the literal text for each hunk, in the same order the parser
 * yields boundaries.
 *
 * Returns `null` when `patch` is empty/whitespace-only or no hunk in it
 * intersects the given line range — never a truncated or synthesized diff.
 */
export function sliceFindingHunks(
  patch: string,
  path: string,
  startLine: number,
  endLine: number,
): string | null {
  if (!patch.trim()) return null;

  const wrapped = `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n${patch}`;
  const parsed = parseUnifiedDiff(wrapped);
  const file = parsed.files.find((f) => f.path === path);
  if (!file || file.hunks.length === 0) return null;

  const lines = patch.split('\n');
  const headerIndexes: number[] = [];
  lines.forEach((line, i) => {
    if (/^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@/.test(line)) headerIndexes.push(i);
  });
  if (headerIndexes.length !== file.hunks.length) return null;

  const blocks = headerIndexes.map((start, i) => {
    const end = i + 1 < headerIndexes.length ? headerIndexes[i + 1]! : lines.length;
    return lines.slice(start, end).join('\n');
  });

  const matchingBlocks = file.hunks
    .map((hunk, i) => ({ hunk, block: blocks[i]! }))
    .filter(({ hunk }) => hunk.newLineNumbers.some((n) => n >= startLine && n <= endLine))
    .map(({ block }) => block);

  if (matchingBlocks.length === 0) return null;
  return matchingBlocks.join('\n');
}
