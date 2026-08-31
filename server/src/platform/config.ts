import 'dotenv/config';
import { z } from 'zod';
import { homedir } from 'node:os';
import { join, isAbsolute, resolve } from 'node:path';

/**
 * Central, zod-validated environment config. Loaded once at startup.
 *
 * NOTE: secret keys (OPENAI/ANTHROPIC/OPENROUTER/GITHUB_TOKEN) are deliberately
 * NOT in this schema. Feature code must access secrets through SecretsProvider,
 * never via process.env or AppConfig — the SecretsProvider is the one chokepoint
 * that reads process.env directly (see adapters/secrets/local.ts). Listing them
 * here would be dead config that never reaches AppConfig.
 */
const EnvSchema = z.object({
  DATABASE_URL: z
    .string()
    .default('postgres://devdigest:devdigest@localhost:5432/devdigest'),
  // Memory/RAG embeddings run on OpenAI (text-embedding-3-small, 1536-dim — the
  // pgvector columns are locked to that). Default OFF so the app makes ZERO
  // OpenAI requests; set EMBEDDINGS_ENABLED=true to turn memory retrieval on.
  EMBEDDINGS_ENABLED: z.string().optional(),
  // repo-intel facade (Tier 1). Default ON — reviews get repo skeleton +
  // callers context. Set REPO_INTEL_ENABLED=false to opt out, in which case
  // every consumer degrades to ripgrep-identical behavior (acceptance #10).
  // Note: even when on, sections only populate once the repo is indexed; an
  // unindexed repo degrades gracefully. Per-agent override: agents.repo_intel.
  REPO_INTEL_ENABLED: z.string().optional(),
  // Project context docs (SPEC-01): comma-separated top-level directory names
  // scanned for attachable `.md` files in a repo's clone. Default covers the
  // three canonical roots; operators may add/replace via env. Each segment is
  // a single relative path component — no '/', '\', or '..' (see loadConfig).
  CONTEXT_DOC_ROOTS: z.string().optional(),
  // Export to CI (SPEC-05): where the already-built agent-runner bundle
  // (`ncc build` output) lives on disk. Default assumes the standard sibling
  // layout (`<repo-root>/agent-runner/dist/index.js`) relative to server/'s
  // own cwd. This module never builds the bundle — a missing file is a valid
  // "not built yet" state (see RunnerBundle adapter).
  RUNNER_BUNDLE_PATH: z.string().optional(),
  // ADDENDUM v2 — ingest auth contract: the base URL the GENERATED workflow
  // POSTs `devdigest-result.json` to (`${DEVDIGEST_INGEST_URL}/ci/ingest`).
  // Not a secret — baked as a literal into the exported workflow file, so it
  // must be this DevDigest instance's own publicly-reachable address.
  // Defaults to localhost for dev; production deployments MUST set this or
  // every exported workflow will point at an unreachable URL.
  DEVDIGEST_INGEST_URL: z.string().optional(),
  API_PORT: z.coerce.number().int().default(3001),
  WEB_PORT: z.coerce.number().int().default(3000),
  DEVDIGEST_CLONE_DIR: z.string().optional(),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  // `.env` (and .env.example) ship `LOG_LEVEL=` empty; an empty string is not a
  // valid enum member, so coerce '' → undefined to fall through to the default.
  LOG_LEVEL: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),
  ),
});

export type AppConfig = {
  databaseUrl: string;
  apiPort: number;
  webPort: number;
  /** Absolute path where repos are cloned (~/.devdigest/workspace by default). */
  cloneDir: string;
  /** Absolute path to the writable secrets store (BYO keys from the UI). */
  secretsPath: string;
  nodeEnv: 'development' | 'test' | 'production';
  logLevel: string;
  /** Allowed CORS origin for the Next.js dev server. */
  webOrigin: string;
  /** Whether memory/RAG embeddings (OpenAI) are enabled. Default false. */
  embeddingsEnabled: boolean;
  /**
   * Whether the repo-intel facade (Tier 1: phantom-gate, callers-in-prompt) is
   * active. Default ON — set REPO_INTEL_ENABLED=false to opt out, in which case
   * every facade method returns its degraded result (`[]`) so consumers behave
   * EXACTLY like the ripgrep-only baseline.
   */
  repoIntelEnabled: boolean;
  /**
   * Top-level directory names (relative to a repo's clone root) scanned for
   * attachable `.md` context docs. Default `['specs', 'docs', 'insights']`.
   */
  contextDocRoots: string[];
  /** Absolute path to the built CI runner bundle (`agent-runner/dist/index.js`). */
  runnerBundlePath: string;
  /** Base URL a generated CI workflow POSTs `devdigest-result.json` to. */
  ingestUrl: string;
};

const DEFAULT_CONTEXT_DOC_ROOTS = ['specs', 'docs', 'insights'];

/** A root segment must be a single relative path component. */
function isValidContextDocRoot(segment: string): boolean {
  return segment.length > 0 && !segment.includes('/') && !segment.includes('\\') && segment !== '..';
}

function parseContextDocRoots(raw: string | undefined): string[] {
  if (raw === undefined) return DEFAULT_CONTEXT_DOC_ROOTS;
  const roots = raw
    .split(',')
    .map((s) => s.trim())
    .filter(isValidContextDocRoot);
  return roots.length > 0 ? roots : DEFAULT_CONTEXT_DOC_ROOTS;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvSchema.parse(env);
  const cloneDirRaw =
    parsed.DEVDIGEST_CLONE_DIR ?? join(homedir(), '.devdigest', 'workspace');
  const cloneDir = isAbsolute(cloneDirRaw) ? cloneDirRaw : resolve(process.cwd(), cloneDirRaw);
  // server/'s own cwd (dev/test) is the `server/` directory, one level below
  // the repo root — so the default resolves to `<repo-root>/agent-runner/dist/index.js`.
  const runnerBundleRaw =
    parsed.RUNNER_BUNDLE_PATH ?? join('..', 'agent-runner', 'dist', 'index.js');
  const runnerBundlePath = isAbsolute(runnerBundleRaw)
    ? runnerBundleRaw
    : resolve(process.cwd(), runnerBundleRaw);
  return {
    databaseUrl: parsed.DATABASE_URL,
    apiPort: parsed.API_PORT,
    webPort: parsed.WEB_PORT,
    cloneDir,
    secretsPath: join(homedir(), '.devdigest', 'secrets.json'),
    nodeEnv: parsed.NODE_ENV,
    logLevel: parsed.LOG_LEVEL ?? (parsed.NODE_ENV === 'test' ? 'silent' : 'info'),
    webOrigin: `http://localhost:${parsed.WEB_PORT}`,
    embeddingsEnabled: parsed.EMBEDDINGS_ENABLED === 'true',
    repoIntelEnabled: parsed.REPO_INTEL_ENABLED !== 'false',
    contextDocRoots: parseContextDocRoots(parsed.CONTEXT_DOC_ROOTS),
    runnerBundlePath,
    ingestUrl: parsed.DEVDIGEST_INGEST_URL ?? `http://localhost:${parsed.API_PORT}`,
  };
}
