/**
 * Pure path normalization — GitHub's `pr_files.path` and the repo-intel
 * index don't always agree on leading `./`, `/`, or separator style. This
 * bridges that gap without touching the index (R10).
 */
export function normalizeChangedPaths(paths: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of paths) {
    const normalized = normalizeOne(raw);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function normalizeOne(path: string): string {
  let p = path.replace(/\\/g, '/');
  while (p.startsWith('./')) p = p.slice(2);
  while (p.startsWith('/')) p = p.slice(1);
  p = p.replace(/\/{2,}/g, '/');
  return p;
}
