import type { Container } from '../../platform/container.js';
import type { CiExport, CiExportInput, CiInstallation, CiRun } from '@devdigest/shared';
import { CiResultArtifact } from '@devdigest/shared';
import { AppError } from '../../platform/errors.js';
import { WORKFLOW_VERSION } from './constants.js';
import { CiRepository } from './repository.js';
import { toCiInstallationDto, toCiRunDto } from './helpers.js';
import { assertValidRepo, parseRepoRef } from './paths.js';
import { buildBundleFiles, type MemoryEntryForExport } from './bundle.js';
import { generateIngestToken, hashIngestToken } from './ingest-token.js';
import {
  deriveBlockers,
  deriveRunStatus,
  deriveVerdict,
  extractBearerToken,
  isWellFormedCommitSha,
} from './ingest.js';
import type { AgentForManifest, SkillForManifest } from './manifest.js';

/** Branch DevDigest commits the generated bundle to for `action:'open_pr'`
 *  (Pass 5) — never `main`; created off `input.base` when missing, updated
 *  in place otherwise (see `CiRepository.upsertInstallation` for the `pr_url`
 *  persistence rule). */
const OPEN_PR_BRANCH = 'devdigest/ci';

/**
 * A4 — CI service. Business logic for export-bundle generation + installation
 * bookkeeping (SPEC-05). Stays free of Fastify/Drizzle types (onion-
 * architecture, AC-3): it accepts plain domain data (already resolved by
 * `routes.ts` via `agentsRepo`) and returns `CiExport`/`CiInstallation[]`/
 * `CiRun[]`.
 */

/**
 * Port for reading the already-built `agent-runner/dist/index.js` bundle.
 * Declared here, next to its one consumer (`exportCi`), per the
 * onion-architecture skill — the real implementation (reads a configured
 * path off disk) lives in `server/src/adapters/runner-bundle/` and is
 * exposed via `Container.runnerBundle`. Deliberately does NOT build the
 * bundle (scope decision: agent-runner is an external, unbuilt-by-us
 * dependency) — a missing bundle surfaces as `null`, which `exportCi` turns
 * into a 5xx.
 */
export interface RunnerBundle {
  /** Returns the bundle's file contents, or `null` if it hasn't been built. */
  read(): Promise<string | null>;
}

export class UnsupportedCiTargetError extends AppError {
  constructor(target: string) {
    super('unsupported_ci_target', `CI target "${target}" is not implemented yet`, 422);
  }
}

export class RunnerBundleMissingError extends AppError {
  constructor() {
    super(
      'runner_bundle_missing',
      'The CI runner bundle is not built yet (run `pnpm build` in agent-runner/).',
      503,
    );
  }
}

/** Pass 6 — bearer token missing, malformed, or matches no installation.
 *  Deliberately generic (never says WHICH check failed) so a probing caller
 *  can't distinguish "no such token" from "token exists, something else is
 *  wrong" — same rationale as returning 404 (not 403) for foreign-workspace
 *  agent lookups elsewhere in this codebase. */
export class InvalidIngestTokenError extends AppError {
  constructor() {
    super('invalid_ingest_token', 'Invalid or missing ingest token', 401);
  }
}

/** Pass 6 — the artifact's identity headers don't match the token's
 *  installation (repo mismatch) or are missing/malformed (commit SHA). */
export class IngestValidationError extends AppError {
  constructor(message: string) {
    super('ingest_validation_error', message, 422);
  }
}

/** A CI installation plus the status of its most recent run (AC-15/AC-19) —
 *  not a new shared contract, just a composition of two existing ones for
 *  this one read model. */
export interface CiInstallationStatus {
  installation: CiInstallation;
  last_run: CiRun | null;
  /** PART C, item 9 — recent run history for this installation (last ~10,
   *  `ran_at` desc), so the CI tab can render history without a new
   *  endpoint. */
  runs: CiRun[];
}

/** Recent run history cap per installation (PART C, item 9). */
const RUN_HISTORY_LIMIT = 10;

export class CiService {
  private repo: CiRepository;

  constructor(private container: Container) {
    this.repo = container.ciRepo;
  }

  /**
   * Generate the export bundle for one agent + persist (or preview) the
   * installation. `target !== 'gha'` is rejected before any file is
   * generated or persisted (AC-12, scope decision #1).
   *
   * Pass 5 — three actions, three very different side-effect profiles:
   *  - `'preview'` (CRITICAL): builds and returns the bundle with ZERO
   *    GitHub calls and ZERO DB writes. This is what the wizard's debounced
   *    Preview step must call — `'open_pr'` now has a REAL side effect
   *    (opens a PR), so wiring Preview to it would spam PRs on every
   *    keystroke.
   *  - `'files'`: persists the installation (zip-download path).
   *  - `'open_pr'` (now REAL, reversing the v1 stub): commits the bundle to
   *    `devdigest/ci` off `input.base` and opens (or reuses) a PR, then
   *    persists the installation with the resulting `pr_url`. NEVER writes
   *    to `input.base`/`main` directly — only ever commits to the dedicated
   *    branch via `GitHubClient.commitFiles`.
   *
   * `'files'`/`'open_pr'` also mint a fresh per-installation ingest bearer
   * token (ADDENDUM v2 "Ingest auth contract") — only its hash is persisted;
   * the plaintext is returned once as `CiExport.ingest_token`.
   */
  async exportCi(
    workspaceId: string,
    agent: AgentForManifest & { id: string },
    skills: SkillForManifest[],
    input: CiExportInput,
  ): Promise<CiExport> {
    if (input.target !== 'gha') {
      throw new UnsupportedCiTargetError(input.target);
    }
    assertValidRepo(input.repo);

    // NFR-1/EC-8: pure CPU render, no network — the runner bundle is a local
    // read, never fetched.
    const runnerBundleContents = await this.container.runnerBundle.read();
    if (runnerBundleContents === null) {
      throw new RunnerBundleMissingError();
    }

    // ADDENDUM v2 decision 3 — minimal memory export (see repository.ts
    // `listGlobalMemory` for the FLAGGED scope decision).
    const memoryRows = await this.repo.listGlobalMemory(workspaceId);
    const memoryEntries: MemoryEntryForExport[] = memoryRows.map((row) => ({
      kind: row.kind,
      scope: row.scope,
      content: row.content,
      confidence: row.confidence,
      createdAt: row.createdAt.toISOString(),
    }));

    const files = buildBundleFiles({
      agent,
      skills,
      triggers: input.triggers,
      postAs: input.post_as,
      runnerBundleContents,
      memoryEntries,
      ingest: { ingestBaseUrl: this.container.config.ingestUrl },
    });

    if (input.action === 'preview') {
      // CRITICAL (Pass 5): no GitHub call, no `this.repo.*` write — only the
      // read-only `listGlobalMemory` above, which is a read, not a write.
      return {
        installation: toCiInstallationDto(this.repo.previewInstallation(agent.id, input.repo)),
        files,
        pr_url: null,
        ingest_token: null,
      };
    }

    let prUrl: string | undefined;
    if (input.action === 'open_pr') {
      const github = await this.container.github();
      const repoRef = parseRepoRef(input.repo);
      // Least-privilege: only `commitFiles` (contents) + `findOpenPr`/
      // `openPullRequest` (pull_requests) are ever exercised here.
      await github.commitFiles(repoRef, {
        branch: OPEN_PR_BRANCH,
        base: input.base,
        message: 'Add DevDigest CI review',
        files: files.map((f) => ({ path: f.path, contents: f.contents })),
      });
      const existing = await github.findOpenPr(repoRef, OPEN_PR_BRANCH);
      prUrl = existing
        ? existing.url
        : (
            await github.openPullRequest(repoRef, {
              title: 'Add DevDigest CI review',
              head: OPEN_PR_BRANCH,
              base: input.base,
              body: 'Adds the DevDigest CI review workflow, agent manifest, and skills bundle generated by DevDigest.',
            })
          ).url;
    }

    const { token, hash } = generateIngestToken();
    const installationRow = await this.repo.upsertInstallation(
      agent.id,
      input.repo,
      WORKFLOW_VERSION,
      hash,
      prUrl,
    );

    return {
      installation: toCiInstallationDto(installationRow),
      files,
      pr_url: prUrl ?? null,
      ingest_token: token,
    };
  }

  /** Installations for one agent, each with its latest run's status (AC-15).
   *  Assumes the caller already checked the agent belongs to `workspaceId`
   *  (route 404s first) — this still re-scopes via the repository's own join
   *  to `agents` as a second guard (AC-22). */
  async listInstallations(workspaceId: string, agentId: string): Promise<CiInstallationStatus[]> {
    const installations = await this.repo.listInstallations(workspaceId, agentId);
    if (installations.length === 0) return [];
    const ids = installations.map((i) => i.id);
    const [latest, history] = await Promise.all([
      this.repo.latestRunByInstallation(ids),
      this.repo.runsByInstallation(ids, RUN_HISTORY_LIMIT),
    ]);
    return installations.map((row) => {
      const run = latest.get(row.id);
      return {
        installation: toCiInstallationDto(row),
        last_run: run ? toCiRunDto({ ...run, repo: row.repo }) : null,
        runs: (history.get(row.id) ?? []).map((r) => toCiRunDto({ ...r, repo: row.repo })),
      };
    });
  }

  /** All CI runs visible to the workspace, newest first (AC-17). Read-only —
   *  `listRuns` itself never inserts into `ci_runs`; `ingestResult` below is
   *  the ONLY writer (Pass 6, ADDENDUM v2 decision 2 reverses AC-18/D-6). */
  async listRuns(workspaceId: string): Promise<CiRun[]> {
    const rows = await this.repo.listRuns(workspaceId);
    return rows.map(toCiRunDto);
  }

  /**
   * Pass 6 — authenticated CI-result ingest, dual-write. The bearer token IS
   * the credential (no workspace session): it's hashed and matched against
   * `ci_installations.ingest_token_hash`, and workspace/agent identity is
   * derived entirely from the matched installation — the request body is
   * NEVER trusted for identity, only for the review outcome (findings/cost/
   * duration).
   *
   * Order matters for what a probing/malformed request learns:
   *  1. bad/absent token → `InvalidIngestTokenError` (401) before anything
   *     else is inspected, so a wrong-schema body from an unauthenticated
   *     caller still reports 401, not 422.
   *  2. commit-SHA header malformed, or repo header mismatched against the
   *     resolved installation → `IngestValidationError` (422).
   *  3. artifact fails `CiResultArtifact` — a thrown `ZodError`, caught by
   *     the app's global error handler as 422 (see `app.ts`).
   *  4. dual-write via `CiRepository.ingestResult`, one transaction — on any
   *     failure inside it, neither row is written.
   */
  async ingestResult(input: {
    authorizationHeader: string | undefined;
    commitShaHeader: string | undefined;
    repositoryHeader: string | undefined;
    body: unknown;
  }): Promise<{ agent_run_id: string; ci_run_id: string }> {
    const token = extractBearerToken(input.authorizationHeader);
    if (!token) throw new InvalidIngestTokenError();

    const found = await this.repo.findInstallationByTokenHash(hashIngestToken(token));
    if (!found) throw new InvalidIngestTokenError();

    if (!isWellFormedCommitSha(input.commitShaHeader)) {
      throw new IngestValidationError('Missing or malformed X-Devdigest-Commit-Sha header');
    }
    if (input.repositoryHeader !== found.installation.repo) {
      throw new IngestValidationError('X-Devdigest-Repository header does not match the installation');
    }

    // Throws ZodError on a bad shape — the global error handler maps that to
    // 422 (app.ts). Never trust this body for identity, only for outcome data.
    const artifact = CiResultArtifact.parse(input.body);

    const blockers = deriveBlockers(artifact, found.ciFailOn);
    const status = deriveRunStatus(artifact);
    const verdict = deriveVerdict(blockers, artifact.findings_count);

    const prId =
      artifact.pr_number != null
        ? await this.repo.findPrId(found.workspaceId, found.installation.repo, artifact.pr_number)
        : null;

    const result = await this.repo.ingestResult({
      installationId: found.installation.id,
      agentId: found.agentId,
      workspaceId: found.workspaceId,
      prId,
      prNumber: artifact.pr_number ?? null,
      status,
      verdict,
      findingsCount: artifact.findings_count,
      costUsd: artifact.cost_usd,
      durationMs: artifact.duration_ms ?? null,
      blockers,
      githubUrl: artifact.github_url ?? null,
      commitSha: input.commitShaHeader,
    });

    return { agent_run_id: result.agentRunId, ci_run_id: result.ciRunId };
  }
}
