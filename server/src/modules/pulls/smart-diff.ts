import type { SmartDiff, SmartDiffRole, SmartDiffFile, ProposedSplit } from '@devdigest/shared';
import {
  BOILERPLATE_PATTERNS,
  WIRING_PATTERNS,
  SPLIT_TOO_BIG_LINES,
  SPLIT_MIN_CORE_FILES,
} from './smart-diff.constants.js';

/**
 * Smart Diff — pure classification + assembly. No `Db`, `fastify`, `this`,
 * dates, or env reads (mirrors `status.ts` / `skills/stats.ts`): the
 * repository hands this plain data, the service returns whatever this
 * produces untouched. Makes NO LLM call — classification is entirely
 * path-pattern based, per the feature requirement.
 */

/** Human-readable label per role, used both for `ProposedSplit.name` and as
 *  the stable rendering order of `SmartDiff.groups`. */
const ROLE_ORDER: { role: SmartDiffRole; label: string }[] = [
  { role: 'core', label: 'Core' },
  { role: 'wiring', label: 'Wiring' },
  { role: 'boilerplate', label: 'Boilerplate' },
];

/** First-match-wins, checked in order boilerplate → wiring → core: a file
 *  that would otherwise look like "wiring" (e.g. `dist/index.ts`) is still
 *  boilerplate once it lives under a generated/mechanical path. Anything
 *  matching neither pattern set is `core` — the substance of the change. */
export function classifyFile(path: string): SmartDiffRole {
  if (BOILERPLATE_PATTERNS.some((re) => re.test(path))) return 'boilerplate';
  if (WIRING_PATTERNS.some((re) => re.test(path))) return 'wiring';
  return 'core';
}

export interface SmartDiffInputFile {
  path: string;
  additions: number;
  deletions: number;
}

/** Builds the `SmartDiff` contract from already-imported PR files and the
 *  finding lines of the PR's latest review run. Groups render in a stable
 *  `core → wiring → boilerplate` order regardless of which groups are
 *  non-empty; within a group, files sort by total changed lines (additions +
 *  deletions) descending — biggest changes first. */
export function buildSmartDiff(
  files: SmartDiffInputFile[],
  findingLinesByPath: Map<string, number[]>,
): SmartDiff {
  const byRole = new Map<SmartDiffRole, SmartDiffFile[]>();
  for (const { role } of ROLE_ORDER) byRole.set(role, []);

  for (const file of files) {
    const role = classifyFile(file.path);
    const findingLines = [...new Set(findingLinesByPath.get(file.path) ?? [])].sort(
      (a, b) => a - b,
    );
    byRole.get(role)!.push({
      path: file.path,
      pseudocode_summary: null,
      additions: file.additions,
      deletions: file.deletions,
      finding_lines: findingLines,
    });
  }

  const groups = ROLE_ORDER.map(({ role }) => {
    const groupFiles = byRole.get(role)!;
    groupFiles.sort((a, b) => b.additions + b.deletions - (a.additions + a.deletions));
    return { role, files: groupFiles };
  });

  const totalLines = files.reduce((sum, f) => sum + f.additions + f.deletions, 0);
  const coreFileCount = byRole.get('core')!.length;
  const tooBig = totalLines > SPLIT_TOO_BIG_LINES || coreFileCount > SPLIT_MIN_CORE_FILES;

  const proposedSplits: ProposedSplit[] = tooBig
    ? ROLE_ORDER.filter(({ role }) => byRole.get(role)!.length > 0).map(({ role, label }) => ({
        name: label,
        files: byRole.get(role)!.map((f) => f.path),
      }))
    : [];

  return {
    groups,
    split_suggestion: {
      too_big: tooBig,
      total_lines: totalLines,
      proposed_splits: proposedSplits,
    },
  };
}
