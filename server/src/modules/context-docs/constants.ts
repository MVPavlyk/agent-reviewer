/**
 * context-docs module constants (SPEC-01 + SPEC-02, 30-plan.md Крок 4).
 *
 * Reuses repo-intel's file-size/count guards instead of duplicating them —
 * they express the same "don't choke on a pathological clone" concern.
 */
export { MAX_FILE_SIZE, MAX_INDEXED_FILES } from '../repo-intel/constants.js';

/**
 * `GET /repos/:repoId/context-docs/content` truncates the returned preview to
 * this many characters, reporting `truncated: true` past the cut (SPEC-02
 * AC-7/EC-8). This is a preview-only limit — the run-time reader
 * (`read-for-run.ts`, Крок 8) reads the full file, not this truncated view.
 */
export const PREVIEW_MAX_CHARS = 20_000;
