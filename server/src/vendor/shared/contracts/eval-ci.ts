import { z } from 'zod';
import { Verdict, Finding } from './findings.js';
import { EvalRun, EvalOwnerKind, Conformance, Provider, CiFailOn } from './knowledge.js';

/**
 * A4 — Eval / CI / Compose / Conformance API contracts (L06).
 *
 * These EXTEND the barrel; they do not modify existing contract files. The base
 * `EvalRun`, `EvalCase`, `EvalOwnerKind`, `Conformance` live in `knowledge.ts`;
 * here we add the *API-facing* request/response shapes (records persisted in
 * `eval_runs`, `composed_reviews`, `ci_installations`, `ci_runs`,
 * `conformance_checks`) plus the eval-dashboard aggregate.
 */

// ===========================================================================
// Eval — case input + persisted run record + dashboard
// ===========================================================================

/** Create/update payload for an eval case (id + owner resolved by the route). */
export const EvalCaseInput = z.object({
  owner_kind: EvalOwnerKind,
  owner_id: z.string(),
  name: z.string().min(1),
  input_diff: z.string().default(''),
  input_files: z.unknown().nullish(),
  input_meta: z.unknown().nullish(),
  expected_output: z.unknown(),
  notes: z.string().nullish(),
});
export type EvalCaseInput = z.infer<typeof EvalCaseInput>;

/** A persisted eval run row (one execution of a case), returned by the API. */
export const EvalRunRecord = z.object({
  id: z.string(),
  case_id: z.string(),
  case_name: z.string().nullish(),
  ran_at: z.string(),
  actual_output: z.unknown(),
  pass: z.boolean().nullable(),
  recall: z.number().nullable(),
  precision: z.number().nullable(),
  citation_accuracy: z.number().nullable(),
  duration_ms: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
});
export type EvalRunRecord = z.infer<typeof EvalRunRecord>;

/** Result of running a single case: the metrics (EvalRun) + the persisted row id. */
export const EvalRunResult = z.object({
  run_id: z.string(),
  case_id: z.string(),
  result: EvalRun,
});
export type EvalRunResult = z.infer<typeof EvalRunResult>;

/** One point on the dashboard trend (per run, chronological). */
export const EvalTrendPoint = z.object({
  ran_at: z.string(),
  recall: z.number(),
  precision: z.number(),
  citation_accuracy: z.number(),
  pass_rate: z.number(),
  cost_usd: z.number().nullable(),
});
export type EvalTrendPoint = z.infer<typeof EvalTrendPoint>;

/** Aggregate dashboard for an owner (agent/skill) or the whole workspace. */
export const EvalDashboard = z.object({
  owner_kind: EvalOwnerKind.nullable(),
  owner_id: z.string().nullable(),
  cases_total: z.number().int(),
  current: z.object({
    recall: z.number(),
    precision: z.number(),
    citation_accuracy: z.number(),
    traces_passed: z.number().int(),
    traces_total: z.number().int(),
    cost_usd: z.number().nullable(),
  }),
  delta: z.object({
    recall: z.number(),
    precision: z.number(),
    citation_accuracy: z.number(),
  }),
  trend: z.array(EvalTrendPoint),
  recent_runs: z.array(EvalRunRecord),
  alert: z.string().nullable(),
});
export type EvalDashboard = z.infer<typeof EvalDashboard>;

// ===========================================================================
// Eval batches (L-06 eval pipeline) — "run all evals" for an agent, one row
// per click. Mirrors `eval_run_batches`; aggregates are pre-computed at
// executor time (NFR-1) — the API never recomputes metrics on the fly.
// ===========================================================================

export const EvalBatchStatus = z.enum(['running', 'succeeded', 'partial', 'failed']);
export type EvalBatchStatus = z.infer<typeof EvalBatchStatus>;

/** A persisted eval run batch (mirrors `eval_run_batches`), returned by the API. */
export const EvalBatchRecord = z.object({
  id: z.string(),
  agent_id: z.string(),
  agent_version: z.number().int(),
  system_prompt_snapshot: z.string(),
  system_prompt_hash: z.string(),
  model: z.string(),
  provider: z.string(),
  skill_slugs: z.array(z.string()).nullable(),
  case_ids: z.array(z.string()),
  status: EvalBatchStatus,
  recall: z.number().nullable(),
  precision: z.number().nullable(),
  citation_accuracy: z.number().nullable(),
  cost_usd: z.number().nullable(),
  traces_passed: z.number().int().nullable(),
  traces_total: z.number().int().nullable(),
  duration_ms: z.number().int().nullable(),
  label: z.string().nullable(),
  error: z.string().nullable(),
  started_at: z.string(),
  finished_at: z.string().nullable(),
});
export type EvalBatchRecord = z.infer<typeof EvalBatchRecord>;

/** An eval case plus the status of its most recent run — read model for the UI. */
export const EvalCaseRecord = z.object({
  id: z.string(),
  owner_kind: EvalOwnerKind,
  owner_id: z.string(),
  name: z.string(),
  input_diff: z.string(),
  input_meta: z.unknown(),
  expected_output: z.unknown(),
  notes: z.string().nullish(),
  last_run: z
    .object({
      run_id: z.string(),
      batch_id: z.string().nullable(),
      pass: z.boolean().nullable(),
      ran_at: z.string(),
    })
    .nullable(),
});
export type EvalCaseRecord = z.infer<typeof EvalCaseRecord>;

/**
 * Per-case comparison row for `GET /eval-runs/compare`. The server only
 * reports presence + pass per batch — classifying transitions (regression,
 * "only in A/B", error) is UI logic (Крок 18), not computed here.
 */
export const EvalCompareCase = z.object({
  case_id: z.string(),
  case_name: z.string(),
  in_a: z.boolean(),
  in_b: z.boolean(),
  pass_a: z.boolean().nullable(),
  pass_b: z.boolean().nullable(),
});
export type EvalCompareCase = z.infer<typeof EvalCompareCase>;

/** Response of `GET /eval-runs/compare?a=&b=` — both batch snapshots + per-case rows. */
export const EvalCompare = z.object({
  batch_a: EvalBatchRecord,
  batch_b: EvalBatchRecord,
  cases: z.array(EvalCompareCase),
});
export type EvalCompare = z.infer<typeof EvalCompare>;

// ===========================================================================
// Compose Review
// ===========================================================================

export const ComposeReviewInput = z.object({
  /** Finding ids to fold into the draft (optional — body may be hand-written). */
  finding_ids: z.array(z.string()).default([]),
  /** Editable markdown body. If omitted, the server composes one from findings. */
  body: z.string().nullish(),
  verdict: Verdict.default('comment'),
  /** When true, attach selected findings as inline comments (path+line+body). */
  inline_comments: z.boolean().default(false),
});
export type ComposeReviewInput = z.infer<typeof ComposeReviewInput>;
/** Caller-facing input type — `.default()` fields stay optional (web hooks). */
export type ComposeReviewInputBody = z.input<typeof ComposeReviewInput>;

/** A persisted composed review (mirrors the `composed_reviews` row). */
export const ComposedReview = z.object({
  id: z.string(),
  pr_id: z.string(),
  body: z.string(),
  verdict: Verdict.nullable(),
  posted_at: z.string().nullable(),
  github_review_id: z.string().nullable(),
});
export type ComposedReview = z.infer<typeof ComposedReview>;

/** A preview (no GitHub side-effect) of what would be posted. */
export const ComposeReviewPreview = z.object({
  body: z.string(),
  verdict: Verdict,
  inline_comments: z.array(
    z.object({ path: z.string(), line: z.number().int(), body: z.string() }),
  ),
});
export type ComposeReviewPreview = z.infer<typeof ComposeReviewPreview>;

// ===========================================================================
// Export-to-CI + CI Runs
// ===========================================================================

export const CiTarget = z.enum(['gha', 'circle', 'jenkins', 'cli']);
export type CiTarget = z.infer<typeof CiTarget>;

/** One generated file in the CI bundle (path + editable contents). */
export const CiFile = z.object({
  path: z.string(),
  contents: z.string(),
  editable: z.boolean().default(true),
});
export type CiFile = z.infer<typeof CiFile>;

/**
 * AgentManifest — the agent contract shared by the studio and the CI runner.
 *
 * The studio (`CiService.agentYaml`) WRITES this shape to
 * `.devdigest/agents/<slug>.yaml`; the agent-runner READS it. Keeping one Zod
 * schema for both ends guarantees the formats never drift. `skills` are slugs
 * resolved to `.devdigest/skills/<slug>.md`.
 */
export const AgentManifest = z.object({
  name: z.string().min(1),
  provider: Provider.default('openrouter'),
  model: z.string().min(1),
  system_prompt: z.string(),
  // Tolerate both a missing key and an explicit `null` (YAML `skills:` with no
  // value parses to null, which `.default([])` does NOT catch) — normalize both
  // to an empty array so manifests without skills validate cleanly.
  skills: z
    .array(z.string())
    .nullish()
    .transform((v) => v ?? []),
  strategy: z.enum(['auto', 'single-pass', 'map-reduce']).default('auto'),
  // CI gate policy (see CiFailOn) — when the posted review should BLOCK
  // (REQUEST_CHANGES + fail the check) vs just comment. Default: block on critical.
  ci_fail_on: CiFailOn.default('critical'),
});
export type AgentManifest = z.infer<typeof AgentManifest>;
/** Caller-facing input type — `.default()` fields stay optional. */
export type AgentManifestInput = z.input<typeof AgentManifest>;

/** Request body for `POST /agents/:id/export-ci`. */
export const CiExportInput = z.object({
  repo: z.string().min(1), // "owner/name"
  target: CiTarget.default('gha'),
  /**
   * "open_pr" opens a REAL PR with the files (Pass 5 — reverses the v1
   * stub); "files" persists the installation and returns the files (zip
   * download path); "preview" (Pass 5, CRITICAL) builds and returns the SAME
   * `CiExport` shape with ZERO GitHub calls and ZERO DB writes — this is what
   * the wizard's debounced Preview step must use so it never opens a PR as a
   * side effect of typing.
   */
  action: z.enum(['open_pr', 'files', 'preview']).default('open_pr'),
  post_as: z.enum(['github_review', 'pr_comment', 'none']).default('github_review'),
  triggers: z.array(z.string()).default(['opened', 'synchronize', 'reopened']),
  // S2 — reject anything that isn't a plausible git ref before it ever
  // reaches Octokit (branch/PR-creation calls in `service.ts`): no `..`
  // (path-traversal-shaped refs), no whitespace/shell metacharacters.
  base: z
    .string()
    .regex(/^[\w./-]+$/, 'base must look like a git ref (letters, digits, "._-/")')
    .refine((v) => !v.includes('..'), 'base must not contain ".."')
    .default('main'),
});
export type CiExportInput = z.infer<typeof CiExportInput>;
/** Caller-facing input type — `.default()` fields stay optional (web hooks). */
export type CiExportInputBody = z.input<typeof CiExportInput>;

/** A persisted CI installation (mirrors `ci_installations`). */
export const CiInstallation = z.object({
  id: z.string(),
  agent_id: z.string(),
  repo: z.string(),
  target_type: CiTarget,
  installed_at: z.string(),
  /** ADDENDUM v2 — "Workflow version": the `WORKFLOW_VERSION` embedded in
   *  the generated workflow at the export that (re)installed this row. `null`
   *  for rows created before this field existed. */
  workflow_version: z.string().nullable(),
  /** Set when `action:'open_pr'` succeeded for this installation; `null` for
   *  a zip-only (`action:'files'`) install or before any PR was opened. */
  pr_url: z.string().nullable(),
});
export type CiInstallation = z.infer<typeof CiInstallation>;

/** Response of `POST /agents/:id/export-ci`. */
export const CiExport = z.object({
  installation: CiInstallation,
  files: z.array(CiFile),
  pr_url: z.string().nullable(),
  /**
   * Pass 5 — per-installation ingest bearer token, shown ONCE so the wizard
   * can tell the user to add it as the target repo's `DEVDIGEST_INGEST_TOKEN`
   * secret. Only the SHA-256 hash is ever persisted (`ci_installations
   * .ingest_token_hash`); this plaintext never round-trips again after this
   * response. `null` for `action:'preview'` (no installation is persisted,
   * so there is nothing to generate a token for).
   */
  ingest_token: z.string().nullable(),
});
export type CiExport = z.infer<typeof CiExport>;

export const CiRunStatus = z.enum(['succeeded', 'failed', 'no_findings', 'running']);
export type CiRunStatus = z.infer<typeof CiRunStatus>;

/** A CI run row (mirrors `ci_runs`) — ingested from GitHub Actions artifacts. */
export const CiRun = z.object({
  id: z.string(),
  ci_installation_id: z.string().nullable(),
  /** The installation's target repo ("owner/name"), denormalized via a join
   *  to `ci_installations` — lets the CI Runs page show the repo column
   *  without parsing `github_url` (which is usually null). `null` when the
   *  run's installation was deleted (EC-7, `onDelete: 'set null'`). */
  repo: z.string().nullable(),
  pr_number: z.number().int().nullable(),
  ran_at: z.string().nullable(),
  status: z.string().nullable(),
  findings_count: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  github_url: z.string().nullable(),
  source: z.string().nullable(),
  /** Agent NAME (denormalized via a join) — for display; use `agent_id` to
   *  link. `null`/absent when the run's installation was deleted (EC-7). */
  agent: z.string().nullish(),
  /** Agent id, when resolvable (same join/nullability as `agent`). */
  agent_id: z.string().nullish(),
  /** Review verdict from `deriveVerdict` at ingest time — distinct from
   *  `status` (did the RUN complete) — `null` for rows ingested/seeded
   *  before this column existed. */
  verdict: Verdict.nullable(),
  duration_ms: z.number().int().nullable(),
});
export type CiRun = z.infer<typeof CiRun>;

/**
 * The artifact shape uploaded by the CI action (`devdigest-result.json`).
 * Ingested back on refresh to populate `ci_runs` (L06).
 */
export const CiResultArtifact = z.object({
  findings_count: z.number().int(),
  critical: z.number().int().nullish(),
  warning: z.number().int().nullish(),
  suggestion: z.number().int().nullish(),
  // W3 — an ingested artifact is untrusted input from a CI job; bound both
  // numeric aggregates to reject a negative value before it reaches
  // `ci_runs`/`agent_runs` (a negative cost/duration is never legitimate).
  cost_usd: z.number().min(0).nullable(),
  duration_ms: z.number().int().min(0).nullish(),
  agent: z.string(),
  version: z.string().nullish(),
  pr_number: z.number().int().nullish(),
  /**
   * Pass 6 — the GitHub Actions job/run URL, so `ci_runs.github_url` (CI
   * Runs "job link" column, ADDENDUM v2 decision 5) can be populated at
   * ingest time. Optional/nullish: the CURRENT generated workflow
   * (`modules/ci/workflow.ts`) does not yet instruct agent-runner (out of
   * scope for this repo) to populate it — `agent-runner` would build it from
   * the Actions-provided `GITHUB_SERVER_URL`/`GITHUB_REPOSITORY`/`GITHUB_RUN_ID`
   * env vars, which need no extra `env:` wiring from us since Actions sets
   * them automatically. Until agent-runner emits it, ingest just persists
   * `null` — see server/INSIGHTS.md.
   *
   * W2 — constrained to an https://github.com URL: this value is later
   * surfaced to the client as a raw href (CI Runs "job link" column), so a
   * `javascript:`/`data:` value must never be stored/rendered.
   */
  github_url: z
    .string()
    .url()
    .refine((v) => {
      try {
        const u = new URL(v);
        return u.protocol === 'https:' && u.hostname === 'github.com';
      } catch {
        return false;
      }
    }, 'github_url must be an https://github.com URL')
    .nullish(),
});
export type CiResultArtifact = z.infer<typeof CiResultArtifact>;

// ===========================================================================
// Conformance (PRD ↔ PR) — API record (the analysis shape is `Conformance`)
// ===========================================================================

/** Request body for `POST /pulls/:id/conformance`. */
export const ConformanceInput = z.object({
  /** Spec path/id to compare against; if omitted, the first available spec. */
  spec: z.string().nullish(),
  provider: z.enum(['openai', 'anthropic', 'openrouter']).nullish(),
  model: z.string().nullish(),
});
export type ConformanceInput = z.infer<typeof ConformanceInput>;

/** A persisted conformance check (mirrors `conformance_checks` + the report). */
export const ConformanceReport = z.object({
  id: z.string(),
  pr_id: z.string(),
  report: Conformance,
});
export type ConformanceReport = z.infer<typeof ConformanceReport>;

// ===========================================================================
// Hooks (Secret-Leak + Phantom-API detectors) — emit grounding-exempt findings
// ===========================================================================

export const HookKind = z.enum(['secret_leak', 'phantom']);
export type HookKind = z.infer<typeof HookKind>;

/** Result of running the built-in detectors over a PR. */
export const HookScanResult = z.object({
  pr_id: z.string(),
  review_id: z.string().nullable(),
  findings: z.array(Finding),
});
export type HookScanResult = z.infer<typeof HookScanResult>;
