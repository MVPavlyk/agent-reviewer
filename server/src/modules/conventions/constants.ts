/** Constants for the conventions module. */

export const DETECT_CONVENTIONS_JOB_KIND = 'detect-conventions';

/**
 * v1: no per-repo/workspace provider setting exists yet — hardcoded, same
 * provider+model `db/seed.ts` uses for the built-in agents. Revisit as a
 * workspace-level setting once there's a second caller needing configurability.
 */
export const DETECTION_PROVIDER = 'openrouter' as const;
export const DETECTION_MODEL = 'deepseek/deepseek-v4-flash';

/** Cap on how many detected conventions a single scan can persist. */
export const MAX_CONVENTIONS_PER_SCAN = 30;

export const DETECTION_SYSTEM_PROMPT = `You are analyzing a codebase to identify concrete, evidence-backed coding
conventions actually followed in it — naming, error handling, module
structure, testing patterns, and similar house rules. Only report a
convention if you can point to a specific file and line range that
demonstrates it. Do not invent stylistic preferences that aren't visibly
followed in the sampled files. Do not re-suggest anything listed under
"Already decided" below, even worded differently — the user has already
made a call on those.`;
