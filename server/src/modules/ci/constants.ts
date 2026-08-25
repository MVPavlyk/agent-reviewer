/**
 * A4 — CI module constants. File paths/names generated into the export bundle
 * (SPEC-05 AC-5..AC-9). Keep these in one place so `manifest.ts`/`workflow.ts`/
 * `bundle.ts` never hand-roll a path string.
 */

/** Where the studio writes the agent manifest, mirrored by `agent-runner/src/manifest.ts`. */
export const MANIFEST_DIR = '.devdigest/agents';

/** Where the studio writes resolved skill bodies, mirrored by `agent-runner/src/skills.ts`. */
export const SKILLS_DIR = '.devdigest/skills';

/** Where the bundled runner (`agent-runner/dist/index.js`) is embedded in the target repo. */
export const RUNNER_ENTRY_PATH = '.devdigest/runner/index.js';

/** ADDENDUM v2 decision 3 — memory export, one JSON object per line. */
export const MEMORY_PATH = '.devdigest/memory.jsonl';

/**
 * Bumped whenever generated workflow content changes shape (ADDENDUM v2 —
 * "Workflow version"). Embedded as a YAML comment in the generated workflow
 * and persisted on the installation at export time so the CI tab can show
 * which generation produced the installed workflow.
 */
export const WORKFLOW_VERSION = 2;

/** The generated GitHub Actions workflow file. */
export const WORKFLOW_PATH = '.github/workflows/devdigest-review.yml';

/** The actual runner invocation (D-2) — no subcommands/`--agent`; slug comes from the manifest. */
export const RUNNER_RUN_COMMAND = `node ${RUNNER_ENTRY_PATH}`;
