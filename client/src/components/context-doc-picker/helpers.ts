import type { ContextDoc, ContextDocLink } from "@/lib/types";

/** Move `arr[from]` to index `to` — pure, returns a new array. No-op (returns
 *  the same array) when `to` is out of bounds, so callers can compute
 *  `index - 1` / `index + 1` at the array ends without a separate guard.
 *  Copied from `AgentEditor/_components/SkillsTab/helpers.ts` — same shape,
 *  no shared module between the two route trees to promote it into. */
export function moveItem<T>(arr: T[], from: number, to: number): T[] {
  if (to < 0 || to >= arr.length) return arr;
  const copy = arr.slice();
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item as T);
  return copy;
}

/**
 * Sum of `tokens` across the resolved attachment set, exactly mirroring what
 * the run-time prompt assembly sends (server `resolveContextDocs` +
 * `readContextDocsForRun`, SPEC-01 AC-21/AC-22):
 * - dedup by `path`, keeping the first occurrence (AC-34, mirrors SPEC-01 AC-21)
 * - a document inherited through a disabled skill contributes nothing
 *   (AC-35, mirrors SPEC-01 EC-11)
 * - a `path` with no matching scanned doc (deleted from the repo since it was
 *   attached) contributes nothing — it's `missing`, not merely unpriced.
 *
 * No token-budget threshold is applied here on purpose (AC-22/NFR-3) — this
 * is a sum, not a limit.
 */
export function sumActiveTokens(links: ContextDocLink[], docs: ContextDoc[]): number {
  const docsByPath = new Map(docs.map((d) => [d.path, d]));
  const seen = new Set<string>();
  let total = 0;
  for (const link of links) {
    if (seen.has(link.path)) continue;
    seen.add(link.path);
    if (link.source === "skill" && link.skill_enabled === false) continue;
    const doc = docsByPath.get(link.path);
    if (!doc) continue; // missing — no longer found in the repo's clone
    total += doc.tokens;
  }
  return total;
}

/** Case-insensitive filter over a doc's path — shared by every attach-list
 *  filter box on this component (mirrors `skill-picker/helpers.ts#filterSkills`). */
export function filterDocs(docs: ContextDoc[], query: string): ContextDoc[] {
  const q = query.trim().toLowerCase();
  if (!q) return docs;
  return docs.filter((d) => d.path.toLowerCase().includes(q));
}

/** Display name for a path — the basename, with the full path reserved for a
 *  `title` attribute (client/INSIGHTS.md 2026-08-02: don't render a full repo
 *  path unbounded in a narrow row). */
export function basename(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? path : path.slice(idx + 1);
}
