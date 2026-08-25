import type { Conflict, ConflictTake, Severity } from '@devdigest/shared';

/**
 * Pure cross-agent grouping (SPEC-05 §G-3, D-2/D-3; SPEC-06 AC-27). No I/O,
 * no Drizzle/Fastify types — the service hands this the already-fetched
 * per-agent findings of a multi-agent-run, computed fresh on EVERY read
 * (groups are never persisted; the comment on `Conflict` in
 * `vendor/shared/contracts/observability.ts` documents this). Emits BOTH
 * divergent groups ("where agents disagree") and unanimous ones
 * (agreement/corroboration) — see `computeConflicts`'s own doc for why.
 *
 * Matching rule (D-3, locked): same `file` + overlapping line range. No
 * semantic/embedder matching. `rangeOverlap` below is a local re-derivation
 * of `reviewer-core/src/grounding.ts`'s private `rangeIntersects` — it is not
 * importable across the package boundary, so the same one-line semantics are
 * reproduced here rather than reached for.
 */

/** One finding as seen by the grouping algorithm (subset of a findings row). */
export interface ConflictGroupingFinding {
  id: string;
  file: string;
  startLine: number;
  endLine: number;
  severity: Severity;
  title: string;
  rationale?: string | null;
}

/** One agent's contribution to the multi-agent-run, already filtered to the
 *  set the caller wants considered (only `done` runs feed groups — AC-16/EC-10;
 *  `failed`/`cancelled` runs must be OMITTED by the caller, not passed here,
 *  since they never produced a real verdict — AC-10/EC-8). */
export interface ConflictGroupingRun {
  agentId: string;
  /** Agent display name, surfaced as `ConflictTake.persona`. */
  agentName: string;
  findings: ConflictGroupingFinding[];
}

const SEVERITY_RANK: Record<Severity, number> = { CRITICAL: 3, WARNING: 2, SUGGESTION: 1 };

/** file + line-range overlap (D-3). Half-open-free inclusive comparison —
 *  mirrors `rangeIntersects` in `reviewer-core/src/grounding.ts` (not
 *  importable here: reviewer-core is out of this module's dependency
 *  direction, and that helper is private to grounding.ts either way). */
export function rangeOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

interface TaggedFinding extends ConflictGroupingFinding {
  agentId: string;
  agentName: string;
}

/** Union-Find over indices, used to cluster findings within the same file by
 *  transitive range overlap (A overlaps B, B overlaps C ⇒ A/B/C one group,
 *  even if A doesn't directly overlap C). */
class UnionFind {
  private parent: number[];
  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, i) => i);
  }
  find(x: number): number {
    while (this.parent[x] !== x) {
      this.parent[x] = this.parent[this.parent[x]!]!;
      x = this.parent[x]!;
    }
    return x;
  }
  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent[ra] = rb;
  }
}

/** Pick the worst (highest severity) finding among a set, deterministically:
 *  ties break by original array order (stable — AC-12). */
function worst(findings: TaggedFinding[]): TaggedFinding {
  let best = findings[0]!;
  for (const f of findings.slice(1)) {
    if (SEVERITY_RANK[f.severity] > SEVERITY_RANK[best.severity]) best = f;
  }
  return best;
}

/**
 * Compute the cross-agent groups for one multi-agent-run: every file:line
 * cluster touched by ≥2 of the given (done) agents' findings, one `takes`
 * entry per agent (severity if flagged, `'ignored'` if that agent ran `done`
 * but did not flag it).
 *
 * Only `runs` passed in are considered (caller is responsible for excluding
 * failed/cancelled/still-running agents — AC-16/AC-10/EC-8/EC-10). A single
 * agent's own findings never form a group (need ≥2 agents to compare — EC-2).
 *
 * Includes BOTH divergent groups (a conflict — SPEC-06 AC-27) and unanimous
 * ones (agreement/corroboration — SPEC-05 EC-5): the group's `takes` array is
 * the only signal, deliberately with no separate boolean field. A consumer
 * derives "is this a conflict" by checking whether `takes` is unanimous (all
 * agents flagged the same severity, none `'ignored'`) or not — a "Show only
 * conflicts" toggle filters on that derived property, which requires the
 * unanimous groups to be present in the first place (otherwise the toggle is
 * a no-op).
 *
 * Deterministic (AC-12): pure function of its input, no randomness, stable
 * tie-breaks throughout.
 */
export function computeConflicts(runs: ConflictGroupingRun[]): Conflict[] {
  if (runs.length < 2) return [];

  const byFile = new Map<string, TaggedFinding[]>();
  for (const run of runs) {
    for (const f of run.findings) {
      const tagged: TaggedFinding = { ...f, agentId: run.agentId, agentName: run.agentName };
      const bucket = byFile.get(f.file);
      if (bucket) bucket.push(tagged);
      else byFile.set(f.file, [tagged]);
    }
  }

  const conflicts: Conflict[] = [];

  for (const [file, findings] of byFile) {
    const uf = new UnionFind(findings.length);
    for (let i = 0; i < findings.length; i++) {
      for (let j = i + 1; j < findings.length; j++) {
        if (rangeOverlap(findings[i]!.startLine, findings[i]!.endLine, findings[j]!.startLine, findings[j]!.endLine)) {
          uf.union(i, j);
        }
      }
    }

    const clusters = new Map<number, TaggedFinding[]>();
    for (let i = 0; i < findings.length; i++) {
      const root = uf.find(i);
      const bucket = clusters.get(root);
      if (bucket) bucket.push(findings[i]!);
      else clusters.set(root, [findings[i]!]);
    }

    for (const clusterFindings of clusters.values()) {
      const byAgent = new Map<string, TaggedFinding[]>();
      for (const f of clusterFindings) {
        const bucket = byAgent.get(f.agentId);
        if (bucket) bucket.push(f);
        else byAgent.set(f.agentId, [f]);
      }

      const takes: ConflictTake[] = runs.map((run) => {
        const agentFindings = byAgent.get(run.agentId);
        if (agentFindings && agentFindings.length > 0) {
          const chosen = worst(agentFindings);
          return {
            agent_id: run.agentId,
            persona: run.agentName,
            verdict: chosen.severity,
            note: chosen.rationale?.trim() || chosen.title,
          };
        }
        return {
          agent_id: run.agentId,
          persona: run.agentName,
          verdict: 'ignored' as const,
          note: 'did not flag',
        };
      });

      // Every cluster becomes a group — unanimous (agreement/corroboration)
      // AND divergent (conflict) alike; see the function doc for why no
      // separate boolean field marks which is which.
      const headline = worst(clusterFindings);
      conflicts.push({ file, line: headline.startLine, title: headline.title, takes });
    }
  }

  conflicts.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file.localeCompare(b.file)));
  return conflicts;
}
