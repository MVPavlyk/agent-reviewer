import { describe, it, expect } from 'vitest';
import type { Finding } from '@devdigest/shared';
import { applyScopeFilter, formatIntentDigest } from '../src/index.js';

function finding(overrides: Partial<Finding>): Finding {
  return {
    id: 'f1',
    severity: 'WARNING',
    category: 'bug',
    title: 'Missing null check',
    file: 'src/auth/session.ts',
    start_line: 1,
    end_line: 1,
    rationale: 'r',
    confidence: 0.8,
    ...overrides,
  };
}

describe('applyScopeFilter (deterministic, non-LLM)', () => {
  it('never changes the findings array length, in any scope-match combination', () => {
    const findings: Finding[] = [
      finding({ id: 'in', file: 'src/auth/session.ts', title: 'Session token leak' }),
      finding({ id: 'out', severity: 'SUGGESTION', file: 'src/billing/invoice.ts', title: 'Invoice formatting nit' }),
      finding({ id: 'unknown', file: 'src/unrelated/thing.ts', title: 'Totally different concern' }),
    ];
    const intent = { in_scope: ['session authentication'], out_of_scope: ['billing invoice flow'] };

    const result = applyScopeFilter(findings, intent);

    expect(result).toHaveLength(findings.length);
    expect(result.map((f) => f.id)).toEqual(findings.map((f) => f.id));
  });

  it('tags in-scope matches without touching confidence', () => {
    const findings = [finding({ file: 'src/auth/session.ts', title: 'Session token leak', confidence: 0.9 })];
    const result = applyScopeFilter(findings, { in_scope: ['session authentication'], out_of_scope: [] });
    expect(result[0]!.scope).toBe('in_scope');
    expect(result[0]!.confidence).toBe(0.9);
  });

  it('downweights (never drops) a low-severity out-of-scope finding, min 0.05', () => {
    const findings = [
      finding({ severity: 'SUGGESTION', file: 'src/billing/invoice.ts', title: 'Invoice formatting nit', confidence: 0.06 }),
    ];
    const result = applyScopeFilter(findings, { in_scope: [], out_of_scope: ['billing invoice flow'] });
    expect(result[0]!.scope).toBe('out_of_scope');
    // 0.06 * 0.5 = 0.03, floored to the 0.05 minimum.
    expect(result[0]!.confidence).toBe(0.05);
  });

  it('never downweights a CRITICAL/WARNING out-of-scope finding — one signal survives', () => {
    const findings = [
      finding({ severity: 'CRITICAL', file: 'src/billing/invoice.ts', title: 'SQL injection in billing invoice flow', confidence: 0.95 }),
    ];
    const result = applyScopeFilter(findings, { in_scope: [], out_of_scope: ['billing invoice flow'] });
    expect(result[0]!.scope).toBe('out_of_scope');
    expect(result[0]!.confidence).toBe(0.95);
  });

  it('tags no-match findings as unknown, untouched', () => {
    const findings = [finding({ file: 'src/unrelated/thing.ts', title: 'Totally different concern', confidence: 0.5 })];
    const result = applyScopeFilter(findings, { in_scope: ['session authentication'], out_of_scope: ['billing invoice flow'] });
    expect(result[0]!.scope).toBe('unknown');
    expect(result[0]!.confidence).toBe(0.5);
  });
});

describe('formatIntentDigest', () => {
  it('renders summary + in/out-of-scope bullet lists', () => {
    const text = formatIntentDigest({
      summary: 'Adds session refresh tokens',
      in_scope: ['session authentication'],
      out_of_scope: ['billing invoice flow'],
    });
    expect(text).toContain('Adds session refresh tokens');
    expect(text).toContain('session authentication');
    expect(text).toContain('billing invoice flow');
  });
});
