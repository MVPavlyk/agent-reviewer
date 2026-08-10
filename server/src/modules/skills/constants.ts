/** Constants for the skills module. */

/** Initial version recorded for a newly-created skill. */
export const INITIAL_SKILL_VERSION = 1;

/**
 * Cap on a skill body's length (chars). A skill enters the prompt as an
 * instruction with no `<untrusted>` fence (decision 5 in
 * docs/specs/skills.md), so this bounds how much prompt budget a single skill
 * can consume. ~5k tokens.
 */
export const MAX_BODY_CHARS = 20_000;

// ---- Import (PR 3) ---------------------------------------------------------

/** Hard cap on entries read out of an uploaded archive — bounds a zip bomb's
 *  fan-out even before any entry is inflated. */
export const MAX_ARCHIVE_ENTRIES = 50;

/** Per-entry inflated-size cap (bytes), checked against the zip header's
 *  `originalSize` BEFORE inflating. */
export const MAX_ENTRY_BYTES = 200_000;

/** Case-insensitive basenames tried, in priority order, to find the skill's
 *  documentation entry in an archive. */
export const SKILL_DOC_NAMES = ['SKILL.md', 'skill.md', 'README.md'];

/** Only these extensions ever get inflated from an uploaded archive — nothing
 *  executable (`.sh`, `.js`, …) or binary is ever read. */
export const TEXT_EXTENSIONS = new Set(['.md', '.markdown', '.txt']);

// ---- Stats (Extension — detail tabs + Stats) -------------------------------

/** Fixed findings-by-category window for the Stats tab (decision E5). No
 *  date-range picker in v1 — agents_count/pull_rate/accept_rate stay all-time. */
export const STATS_WINDOW_DAYS = 30;
