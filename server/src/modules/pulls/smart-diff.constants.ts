/**
 * Smart Diff classification data. Pure constants only — no logic here (see
 * `smart-diff.ts` for `classifyFile`/`buildSmartDiff`). Classification order
 * is boilerplate → wiring → core (first pattern match wins), implemented in
 * `classifyFile`; keep that order in sync with the comment below if it ever
 * changes.
 */

/** Lock files, build output, snapshots, and other generated/mechanical
 *  artifacts — reviewers should skim, not read line-by-line. Checked first:
 *  a generated file living under a "wiring-looking" path (e.g. `dist/index.ts`)
 *  is still boilerplate. */
export const BOILERPLATE_PATTERNS: RegExp[] = [
  /(^|\/)pnpm-lock\.yaml$/, // pnpm lockfile
  /(^|\/)package-lock\.json$/, // npm lockfile
  /(^|\/)yarn\.lock$/, // yarn lockfile
  /\.lock$/, // generic lockfiles
  /(^|\/)dist\//, // build output
  /(^|\/)build\//, // build output
  /(^|\/)\.next\//, // Next.js build output
  /(^|\/)out\//, // build output
  /(^|\/)coverage\//, // test coverage reports
  /(^|\/)__snapshots__\//, // test snapshots
  /\.snap$/, // test snapshots
  /\.min\.js$/, // minified bundles
  /\.map$/, // sourcemaps
  /\.generated\./, // codegen output
  /(^|\/)src\/db\/migrations\//, // drizzle-generated migrations
];

/** Configuration, index/barrel files, and app plumbing that hooks the core
 *  logic into the rest of the system — worth a glance, not a close read. */
export const WIRING_PATTERNS: RegExp[] = [
  /(^|\/)index\.tsx?$/, // barrels
  /\.config\.(ts|js|mjs|cjs|json)$/, // build/tool configs
  /(^|\/)tsconfig.*\.json$/, // TypeScript project config
  /(^|\/)package\.json$/, // package manifest
  /(^|\/)\.github\/workflows\//, // CI pipelines
  /(^|\/)Dockerfile$/, // container build
  /(^|\/)docker-compose.*\.ya?ml$/, // container orchestration
  /(^|\/)\.env(\..+)?$/, // env files
  /(^|\/)messages\//, // i18n resource files
  /(^|\/)routes\.ts$/, // Fastify route registration
  /(^|\/)container\.ts$/, // DI composition root
  /\.mdx?$/, // documentation (README, CLAUDE.md, INSIGHTS.md, docs/**) — worth a glance, not code to review closely
];

/** `split_suggestion.too_big` fires when the diff exceeds this many total
 *  changed lines (additions + deletions across all files). No product figure
 *  exists yet in this repo — revisit if one is set. */
export const SPLIT_TOO_BIG_LINES = 400;

/** `split_suggestion.too_big` also fires when the `core` group alone spans
 *  more than this many files — a proxy for "too many unrelated concerns in
 *  one PR" even when the line count is modest. No product figure exists yet
 *  in this repo — revisit if one is set. */
export const SPLIT_MIN_CORE_FILES = 8;
