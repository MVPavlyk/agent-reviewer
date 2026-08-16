import type { Finding } from '@devdigest/shared';

/**
 * Intent Layer — deterministic (NON-LLM) scope filter. Runs after
 * `groundFindings`, before `scoreFromFindings` (see `review/run.ts`).
 *
 * This is intentionally NOT a second LLM call — the Intent Layer plan's
 * budget is exactly two calls per review (the cheap classifier + the main
 * review); a scope-scoring call would make three. It is also intentionally
 * crude (token overlap, not semantic matching): the plan accepts false
 * positives/negatives in both directions as long as the blast radius stays
 * bounded — see the two hard invariants below.
 *
 * Hard invariants (both regression-tested):
 *  1. `findings.length` is NEVER changed — a finding is never dropped because
 *     of scope. Downstream consumers (grounding, persistence) always see the
 *     same count they would without an intent.
 *  2. CRITICAL/WARNING findings matched as out-of-scope keep their original
 *     `confidence` — only SUGGESTION-severity out-of-scope findings are
 *     downweighted. "One real signal survives" beats a clean scope filter.
 */

export interface ScopeIntent {
  in_scope: string[];
  out_of_scope: string[];
}

/** Render a classified Intent as the `## PR intent & scope` prompt digest
 *  (`PromptParts.intent`). Kept alongside the filter it also drives, so the
 *  prompt text and the scope tags are always derived from the same object. */
export function formatIntentDigest(intent: {
  summary: string;
  in_scope: string[];
  out_of_scope: string[];
}): string {
  const inScope = intent.in_scope.length > 0 ? intent.in_scope.map((s) => `- ${s}`).join('\n') : '(none stated)';
  const outScope =
    intent.out_of_scope.length > 0 ? intent.out_of_scope.map((s) => `- ${s}`).join('\n') : '(none stated)';
  return `Summary: ${intent.summary}\n\nIn scope:\n${inScope}\n\nOut of scope:\n${outScope}`;
}

const MIN_CONFIDENCE = 0.05;
const OUT_OF_SCOPE_CONFIDENCE_MULTIPLIER = 0.5;
/** Never downweight a finding at this severity, regardless of scope match. */
const PROTECTED_SEVERITIES = new Set(['CRITICAL', 'WARNING']);

// Generic words that make token overlap meaningless if left in (verbs/nouns
// common to almost every finding title, not proper nouns/identifiers).
const STOP_WORDS = new Set([
  'this', 'that', 'with', 'from', 'into', 'have', 'has', 'the', 'and', 'for',
  'are', 'was', 'were', 'been', 'being', 'does', 'not', 'add', 'adds',
  'added', 'file', 'files', 'change', 'changes', 'changed', 'code', 'line',
  'lines', 'when', 'should', 'would', 'could', 'missing', 'error', 'errors',
]);

function tokenize(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 4 && !STOP_WORDS.has(t));
  return new Set(tokens);
}

function tokensForPhrases(phrases: string[]): Set<string> {
  const all = new Set<string>();
  for (const phrase of phrases) {
    for (const t of tokenize(phrase)) all.add(t);
  }
  return all;
}

function overlaps(a: Set<string>, b: Set<string>): boolean {
  for (const t of a) {
    if (b.has(t)) return true;
  }
  return false;
}

/**
 * Tag each finding `in_scope` / `out_of_scope` / `unknown` from the PR's
 * classified Intent, and downweight (never drop) low-severity out-of-scope
 * noise. Findings array length is always preserved — see module doc.
 */
export function applyScopeFilter(findings: Finding[], intent: ScopeIntent): Finding[] {
  const inScopeTokens = tokensForPhrases(intent.in_scope);
  const outScopeTokens = tokensForPhrases(intent.out_of_scope);

  // No scope info at all → nothing to tag; identical to the no-intent path.
  if (inScopeTokens.size === 0 && outScopeTokens.size === 0) return findings;

  return findings.map((f) => {
    const findingTokens = tokenize(`${f.file} ${f.title}`);
    const matchesInScope = overlaps(findingTokens, inScopeTokens);
    const matchesOutOfScope = !matchesInScope && overlaps(findingTokens, outScopeTokens);

    if (matchesInScope) {
      return { ...f, scope: 'in_scope' as const };
    }
    if (matchesOutOfScope) {
      if (PROTECTED_SEVERITIES.has(f.severity)) {
        return { ...f, scope: 'out_of_scope' as const };
      }
      return {
        ...f,
        scope: 'out_of_scope' as const,
        confidence: Math.max(MIN_CONFIDENCE, f.confidence * OUT_OF_SCOPE_CONFIDENCE_MULTIPLIER),
      };
    }
    return { ...f, scope: 'unknown' as const };
  });
}
