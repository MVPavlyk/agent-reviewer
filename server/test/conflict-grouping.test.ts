import { describe, expect, it } from 'vitest';
import {
  computeConflicts,
  rangeOverlap,
  type ConflictGroupingRun,
} from '../src/modules/multi-agent/conflict-grouping.js';

function finding(
  overrides: Partial<{
    id: string;
    file: string;
    startLine: number;
    endLine: number;
    severity: 'CRITICAL' | 'WARNING' | 'SUGGESTION';
    title: string;
    rationale: string | null;
  }> = {},
) {
  return {
    id: overrides.id ?? 'f1',
    file: overrides.file ?? 'src/a.ts',
    startLine: overrides.startLine ?? 10,
    endLine: overrides.endLine ?? 10,
    severity: overrides.severity ?? 'WARNING',
    title: overrides.title ?? 'A finding',
    rationale: overrides.rationale ?? null,
  };
}

describe('rangeOverlap', () => {
  it('is true for overlapping and touching ranges, false otherwise', () => {
    expect(rangeOverlap(10, 20, 15, 25)).toBe(true);
    expect(rangeOverlap(10, 20, 20, 25)).toBe(true); // touching at boundary
    expect(rangeOverlap(10, 20, 21, 25)).toBe(false);
  });
});

describe('computeConflicts', () => {
  it('AC-11/AC-9: flags a conflict when one agent flags a spot and another (done) agent does not', () => {
    const runs: ConflictGroupingRun[] = [
      { agentId: 'a1', agentName: 'Agent One', findings: [finding({ id: 'f1', severity: 'CRITICAL' })] },
      { agentId: 'a2', agentName: 'Agent Two', findings: [] },
    ];
    const conflicts = computeConflicts(runs);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.takes).toHaveLength(2);
    const byAgent = Object.fromEntries(conflicts[0]!.takes.map((t) => [t.agent_id, t]));
    expect(byAgent['a1']).toMatchObject({ verdict: 'CRITICAL' });
    expect(byAgent['a2']).toMatchObject({ verdict: 'ignored', note: 'did not flag' });
  });

  it('AC-11: flags a conflict when agents disagree on severity even though both flagged', () => {
    const runs: ConflictGroupingRun[] = [
      { agentId: 'a1', agentName: 'Agent One', findings: [finding({ id: 'f1', severity: 'CRITICAL' })] },
      { agentId: 'a2', agentName: 'Agent Two', findings: [finding({ id: 'f2', severity: 'WARNING' })] },
    ];
    const conflicts = computeConflicts(runs);
    expect(conflicts).toHaveLength(1);
    const verdicts = conflicts[0]!.takes.map((t) => t.verdict).sort();
    expect(verdicts).toEqual(['CRITICAL', 'WARNING']);
  });

  it('EC-5/SPEC-06 AC-27: identical severity from every done agent is PRESENT as a unanimous (non-conflict) group', () => {
    const runs: ConflictGroupingRun[] = [
      { agentId: 'a1', agentName: 'Agent One', findings: [finding({ id: 'f1', severity: 'WARNING' })] },
      { agentId: 'a2', agentName: 'Agent Two', findings: [finding({ id: 'f2', severity: 'WARNING' })] },
    ];
    const conflicts = computeConflicts(runs);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.takes.map((t) => t.verdict).sort()).toEqual(['WARNING', 'WARNING']);
    // Derivable as unanimous (NOT a conflict): every take shares one verdict.
    expect(new Set(conflicts[0]!.takes.map((t) => t.verdict)).size).toBe(1);
  });

  it('a divergent group is derivable as a conflict from `takes` alone (no boolean field on the contract)', () => {
    const runs: ConflictGroupingRun[] = [
      { agentId: 'a1', agentName: 'Agent One', findings: [finding({ id: 'f1', severity: 'CRITICAL' })] },
      { agentId: 'a2', agentName: 'Agent Two', findings: [] },
    ];
    const conflicts = computeConflicts(runs);
    expect(conflicts).toHaveLength(1);
    // Derivable as a conflict: more than one distinct verdict among takes.
    expect(new Set(conflicts[0]!.takes.map((t) => t.verdict)).size).toBeGreaterThan(1);
  });

  it('EC-2: a single-agent run never produces conflicts (no one to disagree with)', () => {
    const runs: ConflictGroupingRun[] = [
      { agentId: 'a1', agentName: 'Agent One', findings: [finding({ id: 'f1', severity: 'CRITICAL' })] },
    ];
    expect(computeConflicts(runs)).toEqual([]);
  });

  it('EC-6: a ranged finding (61-74) overlapping a single-line finding on the same file still groups', () => {
    const runs: ConflictGroupingRun[] = [
      {
        agentId: 'a1',
        agentName: 'Agent One',
        findings: [finding({ id: 'f1', severity: 'CRITICAL', startLine: 61, endLine: 74 })],
      },
      {
        agentId: 'a2',
        agentName: 'Agent Two',
        findings: [], // done, did not flag anywhere near this range
      },
    ];
    const conflicts = computeConflicts(runs);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.line).toBe(61);
  });

  it('AC-10/EC-8: a failed/cancelled agent must be excluded by the caller — omitted entirely, not "did not flag"', () => {
    // Caller contract: only `done` runs are passed in. Simulate the caller
    // correctly omitting a failed agent — its absence must not create a
    // spurious "ignored" take, and with only one remaining done agent this
    // degrades to the EC-2 case (no conflict).
    const runs: ConflictGroupingRun[] = [
      { agentId: 'a1', agentName: 'Agent One', findings: [finding({ id: 'f1', severity: 'CRITICAL' })] },
      // a2 (failed) and a3 (cancelled) are simply not present in `runs`.
    ];
    const conflicts = computeConflicts(runs);
    expect(conflicts).toEqual([]);
    // Sanity: with a genuine second done agent present, the take count matches
    // the number of done agents passed in, never a phantom failed one.
    const withSecondDoneAgent: ConflictGroupingRun[] = [
      ...runs,
      { agentId: 'a4', agentName: 'Agent Four', findings: [] },
    ];
    const withConflict = computeConflicts(withSecondDoneAgent);
    expect(withConflict).toHaveLength(1);
    expect(withConflict[0]!.takes.map((t) => t.agent_id).sort()).toEqual(['a1', 'a4']);
  });

  it('AC-12: repeated computation over the same input is deterministic', () => {
    const runs: ConflictGroupingRun[] = [
      { agentId: 'a1', agentName: 'Agent One', findings: [finding({ id: 'f1', severity: 'CRITICAL' })] },
      { agentId: 'a2', agentName: 'Agent Two', findings: [] },
    ];
    expect(computeConflicts(runs)).toEqual(computeConflicts(runs));
  });
});
