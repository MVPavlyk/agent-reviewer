import { describe, expect, it } from 'vitest';
import { sliceFindingHunks } from '../src/modules/evals/hunk-slice.js';

const HUNK_1 = ['@@ -1,3 +1,3 @@', ' line1', '+added1', ' line3'].join('\n');

// New-side line numbers 45..52, exactly the range a finding might cite.
const HUNK_2 = [
  '@@ -40,5 +45,8 @@',
  ' d',
  '+e',
  '+f',
  ' g',
  '+h',
  ' i',
  '+j',
  ' k',
].join('\n');

const HUNK_3 = ['@@ -100,2 +120,2 @@', ' x', ' y'].join('\n');

const THREE_HUNK_PATCH = [HUNK_1, HUNK_2, HUNK_3].join('\n');

describe('sliceFindingHunks', () => {
  it('returns the whole second hunk (header + body) when the finding is fully inside it', () => {
    const result = sliceFindingHunks(THREE_HUNK_PATCH, 'src/x.ts', 45, 52);
    expect(result).toBe(HUNK_2);
  });

  it('returns nothing but the matching hunk — not the whole patch', () => {
    const result = sliceFindingHunks(THREE_HUNK_PATCH, 'src/x.ts', 45, 52);
    expect(result).not.toContain(HUNK_1);
    expect(result).not.toContain(HUNK_3);
  });

  it('returns every hunk (in full) a finding range spans across', () => {
    // 50 lands in hunk 2 (45-52), 121 lands in hunk 3 (120-121).
    const result = sliceFindingHunks(THREE_HUNK_PATCH, 'src/x.ts', 50, 121);
    expect(result).toBe([HUNK_2, HUNK_3].join('\n'));
  });

  it('returns null for an empty patch', () => {
    expect(sliceFindingHunks('', 'src/x.ts', 1, 2)).toBeNull();
    expect(sliceFindingHunks('   \n  ', 'src/x.ts', 1, 2)).toBeNull();
  });

  it('returns null when no hunk intersects the given range', () => {
    expect(sliceFindingHunks(THREE_HUNK_PATCH, 'src/x.ts', 500, 600)).toBeNull();
  });
});
