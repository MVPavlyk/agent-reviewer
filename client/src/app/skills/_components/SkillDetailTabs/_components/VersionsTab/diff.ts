/**
 * A small local line-diff (decision E8, docs/specs/skills.md Extension):
 * `components/diff-viewer/` is GitHub-unified-diff-specific (`PrFile.patch`)
 * and doesn't fit "two arbitrary markdown bodies" — this is a plain LCS-based
 * line diff instead of pulling in the `diff` npm package for one small tab.
 */
export interface DiffLine {
  type: "same" | "add" | "remove";
  text: string;
}

export function diffLines(oldText: string, newText: string): DiffLine[] {
  const a = oldText.split("\n");
  const b = newText.split("\n");
  const n = a.length;
  const m = b.length;

  // dp[i][j] = length of the LCS of a[i:] and b[j:].
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }

  const result: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      result.push({ type: "same", text: a[i]! });
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      result.push({ type: "remove", text: a[i]! });
      i++;
    } else {
      result.push({ type: "add", text: b[j]! });
      j++;
    }
  }
  while (i < n) {
    result.push({ type: "remove", text: a[i]! });
    i++;
  }
  while (j < m) {
    result.push({ type: "add", text: b[j]! });
    j++;
  }
  return result;
}
