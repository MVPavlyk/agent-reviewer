import { describe, it, expect } from 'vitest';
import { SmartDiff } from '@devdigest/shared';
import { classifyFile, buildSmartDiff } from '../src/modules/pulls/smart-diff.js';
import { SPLIT_TOO_BIG_LINES, SPLIT_MIN_CORE_FILES } from '../src/modules/pulls/smart-diff.constants.js';

describe('classifyFile', () => {
  it('classifies business-logic files as core', () => {
    expect(classifyFile('src/modules/pulls/service.ts')).toBe('core');
    expect(classifyFile('src/modules/pulls/repository.ts')).toBe('core');
    expect(classifyFile('src/modules/pulls/smart-diff.ts')).toBe('core');
  });

  it('classifies config and index/barrel files as wiring', () => {
    expect(classifyFile('src/modules/index.ts')).toBe('wiring');
    expect(classifyFile('vitest.config.ts')).toBe('wiring');
    expect(classifyFile('package.json')).toBe('wiring');
  });

  it('classifies markdown documentation as wiring, not core', () => {
    expect(classifyFile('README.md')).toBe('wiring');
    expect(classifyFile('CLAUDE.md')).toBe('wiring');
    expect(classifyFile('server/INSIGHTS.md')).toBe('wiring');
    expect(classifyFile('docs/features/smart-diff.md')).toBe('wiring');
  });

  it('classifies lockfiles and build output as boilerplate', () => {
    expect(classifyFile('pnpm-lock.yaml')).toBe('boilerplate');
    expect(classifyFile('dist/app.js')).toBe('boilerplate');
    expect(classifyFile('src/__snapshots__/foo.snap')).toBe('boilerplate');
  });

  it('checks boilerplate before wiring — a generated index file stays boilerplate', () => {
    expect(classifyFile('dist/index.ts')).toBe('boilerplate');
  });
});

describe('buildSmartDiff', () => {
  const files = [
    { path: 'src/service.ts', additions: 20, deletions: 5 }, // core, 25 lines
    { path: 'src/small.ts', additions: 1, deletions: 1 }, // core, 2 lines
    { path: 'src/index.ts', additions: 3, deletions: 0 }, // wiring
    { path: 'pnpm-lock.yaml', additions: 100, deletions: 0 }, // boilerplate
  ];

  it('renders groups in stable core → wiring → boilerplate order', () => {
    const result = buildSmartDiff(files, new Map());
    expect(result.groups.map((g) => g.role)).toEqual(['core', 'wiring', 'boilerplate']);
  });

  it('sorts files within a group by total changed lines descending', () => {
    const result = buildSmartDiff(files, new Map());
    const core = result.groups.find((g) => g.role === 'core')!;
    expect(core.files.map((f) => f.path)).toEqual(['src/service.ts', 'src/small.ts']);
  });

  it('attaches sorted, deduplicated finding_lines from the map', () => {
    const findingLines = new Map([['src/service.ts', [10, 5, 5, 7]]]);
    const result = buildSmartDiff(files, findingLines);
    const core = result.groups.find((g) => g.role === 'core')!;
    const service = core.files.find((f) => f.path === 'src/service.ts')!;
    expect(service.finding_lines).toEqual([5, 7, 10]);
    const small = core.files.find((f) => f.path === 'src/small.ts')!;
    expect(small.finding_lines).toEqual([]);
  });

  it('sets pseudocode_summary to null', () => {
    const result = buildSmartDiff(files, new Map());
    for (const group of result.groups) {
      for (const file of group.files) {
        expect(file.pseudocode_summary).toBeNull();
      }
    }
  });

  it('computes total_lines and too_big off SPLIT_TOO_BIG_LINES', () => {
    const bigFiles = [{ path: 'src/big.ts', additions: SPLIT_TOO_BIG_LINES, deletions: 1 }];
    const result = buildSmartDiff(bigFiles, new Map());
    expect(result.split_suggestion.total_lines).toBe(SPLIT_TOO_BIG_LINES + 1);
    expect(result.split_suggestion.too_big).toBe(true);
  });

  it('is not too_big at exactly the line threshold with few core files', () => {
    const exact = [{ path: 'src/exact.ts', additions: SPLIT_TOO_BIG_LINES, deletions: 0 }];
    const result = buildSmartDiff(exact, new Map());
    expect(result.split_suggestion.total_lines).toBe(SPLIT_TOO_BIG_LINES);
    expect(result.split_suggestion.too_big).toBe(false);
  });

  it('is too_big when core file count exceeds SPLIT_MIN_CORE_FILES, even with tiny diffs', () => {
    const manyCoreFiles = Array.from({ length: SPLIT_MIN_CORE_FILES + 1 }, (_, i) => ({
      path: `src/file-${i}.ts`,
      additions: 1,
      deletions: 0,
    }));
    const result = buildSmartDiff(manyCoreFiles, new Map());
    expect(result.split_suggestion.too_big).toBe(true);
  });

  it('returns empty proposed_splits when not too_big', () => {
    const result = buildSmartDiff(files, new Map());
    expect(result.split_suggestion.proposed_splits).toEqual([]);
  });

  it('proposes one split per non-empty group when too_big', () => {
    const bigFiles = [{ path: 'src/big.ts', additions: SPLIT_TOO_BIG_LINES + 1, deletions: 0 }];
    const result = buildSmartDiff(bigFiles, new Map());
    expect(result.split_suggestion.proposed_splits).toEqual([
      { name: 'Core', files: ['src/big.ts'] },
    ]);
  });

  it('produces output that satisfies the SmartDiff zod contract', () => {
    const result = buildSmartDiff(files, new Map([['src/service.ts', [1, 2]]]));
    expect(() => SmartDiff.parse(result)).not.toThrow();
  });
});
