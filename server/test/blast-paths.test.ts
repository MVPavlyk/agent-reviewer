import { describe, it, expect } from 'vitest';
import { normalizeChangedPaths } from '../src/modules/blast/blast-paths.js';

describe('normalizeChangedPaths', () => {
  it('strips a leading ./', () => {
    expect(normalizeChangedPaths(['./src/a.ts'])).toEqual(['src/a.ts']);
  });

  it('strips a leading /', () => {
    expect(normalizeChangedPaths(['/src/a.ts'])).toEqual(['src/a.ts']);
  });

  it('normalizes backslashes to forward slashes', () => {
    expect(normalizeChangedPaths(['src\\a.ts'])).toEqual(['src/a.ts']);
  });

  it('collapses duplicated slashes', () => {
    expect(normalizeChangedPaths(['src//a.ts'])).toEqual(['src/a.ts']);
  });

  it('dedupes paths that normalize to the same value, preserving first-seen order', () => {
    expect(normalizeChangedPaths(['./src/a.ts', 'src/a.ts', '/src/a.ts', 'src/b.ts'])).toEqual([
      'src/a.ts',
      'src/b.ts',
    ]);
  });
});
