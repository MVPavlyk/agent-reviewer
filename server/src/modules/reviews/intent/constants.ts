/** System prompt for the intent classifier — a cheap, single-purpose LLM call
 *  (see `classifier.ts`). Kept separate from the review agent's own system
 *  prompt: this call never sees diff bodies, only the sources in
 *  `IntentSourceBundle`. */
export const INTENT_SYSTEM_PROMPT =
  'You classify the INTENT and SCOPE of a pull request from its title, description, ' +
  'linked issue, an optional plan/spec doc, its changed-file list, and diff hunk ' +
  'HEADERS ONLY (never diff line content — you do not have it). ' +
  'Produce: `summary` — one or two sentences describing what this PR is trying to ' +
  'accomplish; `in_scope` — short phrases naming the areas/concerns this PR ' +
  'deliberately touches; `out_of_scope` — short phrases naming related areas/concerns ' +
  'this PR explicitly does NOT address (e.g. "does not touch the payment flow", ' +
  '"no test coverage added"). Base every claim ONLY on the untrusted content provided; ' +
  'never invent scope that is not evidenced by it. Keep phrases short and concrete ' +
  '(a few words), not full sentences.';
