/* prompt-diff.ts — minimal ordinal line-diff for the Compare modal (Крок
   18). No diff library is installed in this repo, and
   `client/src/components/diff-viewer/` is built for unified (patch-format)
   diffs — it doesn't fit two arbitrary text blobs with no hunk headers. This
   is a plain LCS-based line diff: O(n*m), fine for prompt-sized text.

   Always fed `system_prompt_snapshot` from both batches, never the agent's
   current live prompt (AC-64/EC-19) — the caller (`CompareModal.tsx`) owns
   that distinction; this module only knows about two arrays of strings. */

export type DiffLineKind = "added" | "removed" | "same";

export interface DiffLine {
  kind: DiffLineKind;
  text: string;
}

/** Ordinal line diff of `a` against `b` via a longest-common-subsequence
 *  table: lines present in both (in order) are `same`; a line only `a` has
 *  is `removed`; a line only `b` has is `added`. Marks come out in the
 *  natural read order of the merged diff (top to bottom of `b`, matched
 *  lines interleaved). */
export function lineDiff(a: string[], b: string[]): DiffLine[] {
  const n = a.length;
  const m = b.length;

  // lcs[i][j] = length of the LCS of a[i:] and b[j:].
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i]![j] =
        a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }

  const result: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      result.push({ kind: "same", text: a[i]! });
      i += 1;
      j += 1;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      result.push({ kind: "removed", text: a[i]! });
      i += 1;
    } else {
      result.push({ kind: "added", text: b[j]! });
      j += 1;
    }
  }
  while (i < n) {
    result.push({ kind: "removed", text: a[i]! });
    i += 1;
  }
  while (j < m) {
    result.push({ kind: "added", text: b[j]! });
    j += 1;
  }
  return result;
}

/** Convenience wrapper over `lineDiff` for two full text blobs (e.g. two
 *  `system_prompt_snapshot` values). */
export function promptDiff(a: string, b: string): DiffLine[] {
  return lineDiff(a.split("\n"), b.split("\n"));
}
