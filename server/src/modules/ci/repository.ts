import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, isNull, or } from 'drizzle-orm';
import type { CiFailOn } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { CiInstallationRow, CiRunRow, MemoryRow } from '../../db/rows.js';

export type { CiInstallationRow, CiRunRow, MemoryRow };

/** An installation resolved by its ingest-token hash, plus the agent context
 *  the ingest path needs (Pass 6) — never re-derived from a session, since
 *  the bearer token IS the credential here. */
export interface CiInstallationForIngest {
  installation: CiInstallationRow;
  agentId: string;
  workspaceId: string;
  ciFailOn: CiFailOn;
}

/** The two rows written by one ingest (Pass 6 dual-write). */
export interface IngestedResult {
  agentRunId: string;
  ciRunId: string;
}

/** Input to `CiRepository.ingestResult` — already-validated/derived values
 *  only (auth, header checks, and artifact parsing happen in `CiService`). */
export interface IngestResultInput {
  installationId: string;
  agentId: string;
  workspaceId: string;
  prId: string | null;
  prNumber: number | null;
  status: string;
  verdict: string;
  findingsCount: number;
  costUsd: number | null;
  durationMs: number | null;
  blockers: number;
  githubUrl: string | null;
  /** W3 — the ingest idempotency key, paired with `installationId`. Already
   *  validated as well-formed by `CiService.ingestResult` before this is
   *  built (`isWellFormedCommitSha`). */
  commitSha: string;
}

/**
 * A4 — CI data-access. Owns reads/writes on `ci_installations` and
 * READ-ONLY access to `ci_runs` (SPEC-05 D-6: this module never writes
 * `ci_runs`, no ingest endpoint). Workspace-scoping goes through a join to
 * `agents` (AC-22), mirroring `modules/agents/repository.ts`.
 */
export class CiRepository {
  constructor(private db: Db) {}

  /**
   * Upsert on (agent_id, repo) — the table still has no UNIQUE constraint on
   * that pair (D-1 stands; this pass's migration only ADDS columns), so this
   * keeps emulating upsert with select-then-update/insert instead of
   * `onConflictDoUpdate` (AC-11, NFR-3: a repeated export for the same
   * agent+repo updates the existing row rather than multiplying it).
   *
   * `workflowVersion` (ADDENDUM v2 — "Workflow version") is refreshed on
   * every export so the installation always reflects what was actually
   * checked into the target repo most recently.
   *
   * `ingestTokenHash` (Pass 5 — "Ingest auth contract") is likewise
   * refreshed on every REAL export: a fresh bearer token is minted each time
   * (the caller shows the plaintext once), so the old one stops validating.
   * `prUrl` is only ever passed for `action:'open_pr'` — `undefined` leaves
   * an existing row's `pr_url` untouched (an `action:'files'` re-export
   * doesn't know about, and shouldn't clear, a PR opened by an earlier
   * `open_pr` export of the same agent+repo); a fresh row always starts at
   * `null` regardless.
   */
  async upsertInstallation(
    agentId: string,
    repo: string,
    workflowVersion: number,
    ingestTokenHash: string,
    prUrl?: string,
  ): Promise<CiInstallationRow> {
    const [existing] = await this.db
      .select()
      .from(t.ciInstallations)
      .where(and(eq(t.ciInstallations.agentId, agentId), eq(t.ciInstallations.repo, repo)));

    if (existing) {
      const [row] = await this.db
        .update(t.ciInstallations)
        .set({
          targetType: 'gha',
          installedAt: new Date(),
          workflowVersion: String(workflowVersion),
          ingestTokenHash,
          ...(prUrl !== undefined ? { prUrl } : {}),
        })
        .where(eq(t.ciInstallations.id, existing.id))
        .returning();
      return row!;
    }

    const [row] = await this.db
      .insert(t.ciInstallations)
      .values({
        agentId,
        repo,
        targetType: 'gha',
        workflowVersion: String(workflowVersion),
        ingestTokenHash,
        prUrl: prUrl ?? null,
      })
      .returning();
    return row!;
  }

  /**
   * A non-persisted preview of what an installation WOULD look like — used
   * for `action:'preview'` (Pass 5, CRITICAL: zero GitHub calls, zero DB
   * writes), so the wizard's debounced Preview step never opens a PR or
   * persists a row as a side effect of typing. The response still needs an
   * `installation` shape (`CiExport` is not optional on it), so this
   * fabricates one with a fresh id.
   */
  previewInstallation(agentId: string, repo: string): CiInstallationRow {
    return {
      id: randomUUID(),
      agentId,
      repo,
      targetType: 'gha',
      installedAt: new Date(),
      ingestTokenHash: null,
      workflowVersion: null,
      prUrl: null,
    };
  }

  /**
   * Installations for one agent, workspace-scoped via a join to `agents`
   * (AC-22) even though the route already validates ownership — defense in
   * depth, matching the agents/skills repositories.
   */
  async listInstallations(workspaceId: string, agentId: string): Promise<CiInstallationRow[]> {
    const rows = await this.db
      .select({ installation: t.ciInstallations })
      .from(t.ciInstallations)
      .innerJoin(t.agents, eq(t.ciInstallations.agentId, t.agents.id))
      .where(and(eq(t.ciInstallations.agentId, agentId), eq(t.agents.workspaceId, workspaceId)));
    return rows.map((r) => r.installation);
  }

  /**
   * The latest `ci_runs` row per installation id (AC-15/AC-19) — an
   * installation with zero runs is simply absent from the returned map, so
   * the caller renders a neutral "not run yet" status instead of a
   * fabricated one. Picked in JS (not `ORDER BY ... LIMIT 1` per group) so
   * `ran_at IS NULL` rows (a run that hasn't finished) can't accidentally
   * win a SQL `NULLS FIRST`/`LAST` default ordering ambiguity.
   */
  async latestRunByInstallation(installationIds: string[]): Promise<Map<string, CiRunRow>> {
    const out = new Map<string, CiRunRow>();
    if (installationIds.length === 0) return out;
    const runs = await this.db
      .select()
      .from(t.ciRuns)
      .where(inArray(t.ciRuns.ciInstallationId, installationIds));
    for (const run of runs) {
      if (!run.ciInstallationId) continue;
      const current = out.get(run.ciInstallationId);
      if (!current || (run.ranAt !== null && (current.ranAt === null || run.ranAt > current.ranAt))) {
        out.set(run.ciInstallationId, run);
      }
    }
    return out;
  }

  /**
   * Recent run history per installation (PART C, item 9 — CI tab history) —
   * up to `limit` rows each, newest first. A separate query from
   * `latestRunByInstallation` on purpose: that one picks a single row in JS
   * (so a null `ran_at` can't win); this one only needs to CAP a list, so an
   * `ORDER BY ran_at DESC` in SQL is enough and cheaper for N>1 rows.
   */
  async runsByInstallation(installationIds: string[], limit: number): Promise<Map<string, CiRunRow[]>> {
    const out = new Map<string, CiRunRow[]>();
    if (installationIds.length === 0) return out;
    const rows = await this.db
      .select()
      .from(t.ciRuns)
      .where(inArray(t.ciRuns.ciInstallationId, installationIds))
      .orderBy(desc(t.ciRuns.ranAt));
    for (const run of rows) {
      if (!run.ciInstallationId) continue;
      const list = out.get(run.ciInstallationId) ?? [];
      if (list.length < limit) {
        list.push(run);
        out.set(run.ciInstallationId, list);
      }
    }
    return out;
  }

  /**
   * All `ci_runs` visible to `workspaceId`, newest first (AC-17). READ-ONLY —
   * this module never inserts into `ci_runs` (AC-18, D-6); status/severity
   * pills are derived entirely from rows that already exist (e.g. seed data).
   *
   * Workspace scoping: a run whose installation was deleted has
   * `ci_installation_id = null` (`onDelete: 'set null'`) and thus no path to
   * a workspace at all (EC-7) — those rows are tolerated (kept visible)
   * rather than dropped, since there is no way to attribute them to any
   * workspace; every run with a live installation is properly scoped via the
   * `agents` join.
   */
  async listRuns(
    workspaceId: string,
  ): Promise<
    (CiRunRow & { agentName: string | null; agentId: string | null; repo: string | null })[]
  > {
    const rows = await this.db
      .select({
        run: t.ciRuns,
        agentName: t.agents.name,
        agentId: t.agents.id,
        repo: t.ciInstallations.repo,
      })
      .from(t.ciRuns)
      .leftJoin(t.ciInstallations, eq(t.ciRuns.ciInstallationId, t.ciInstallations.id))
      .leftJoin(t.agents, eq(t.ciInstallations.agentId, t.agents.id))
      .where(or(isNull(t.ciRuns.ciInstallationId), eq(t.agents.workspaceId, workspaceId)))
      .orderBy(desc(t.ciRuns.ranAt));
    return rows.map((r) => ({
      ...r.run,
      agentName: r.agentName ?? null,
      agentId: r.agentId ?? null,
      repo: r.repo ?? null,
    }));
  }

  /**
   * ADDENDUM v2 decision 3 — minimal source for `.devdigest/memory.jsonl`.
   *
   * FLAG (see server/INSIGHTS.md): there is no agent-scoped "memory" model in
   * this codebase — `t.memory` (`db/schema/knowledge.ts`) is workspace/repo
   * -scoped RAG knowledge (decisions/conventions/preferences/facts/learnings),
   * not something tied to a specific agent or to the target repo's
   * `owner/name` string (it FKs a `repos.id`, which this module has no lookup
   * for from a raw `"owner/name"` string). Rather than invent a repo-matching
   * join that isn't backed by any real relationship, this exports the
   * workspace's `scope: 'global'` memory only — the subset that is
   * meaningfully repo-independent — capped at 200 rows, newest first. This is
   * a deliberately minimal export; narrowing/widening the scope is a product
   * decision for whoever owns the memory model next.
   */
  async listGlobalMemory(workspaceId: string): Promise<MemoryRow[]> {
    return this.db
      .select()
      .from(t.memory)
      .where(and(eq(t.memory.workspaceId, workspaceId), eq(t.memory.scope, 'global')))
      .orderBy(desc(t.memory.createdAt))
      .limit(200);
  }

  /**
   * Pass 6 (ADDENDUM v2 decision 2) — resolve an installation by the SHA-256
   * hash of its ingest bearer token. This is the ONLY lookup path for
   * `POST /ci/ingest`: the token is the credential, not a workspace session
   * (`getContext`/`auth.currentWorkspace` are never called on this route).
   * Joins `agents` for `workspaceId`/`ciFailOn`, same pattern as every other
   * workspace-scoping join in this repository.
   */
  async findInstallationByTokenHash(hash: string): Promise<CiInstallationForIngest | null> {
    const [row] = await this.db
      .select({
        installation: t.ciInstallations,
        agentId: t.agents.id,
        workspaceId: t.agents.workspaceId,
        ciFailOn: t.agents.ciFailOn,
      })
      .from(t.ciInstallations)
      .innerJoin(t.agents, eq(t.ciInstallations.agentId, t.agents.id))
      .where(eq(t.ciInstallations.ingestTokenHash, hash));
    if (!row) return null;
    return {
      installation: row.installation,
      agentId: row.agentId,
      workspaceId: row.workspaceId,
      ciFailOn: row.ciFailOn ?? 'critical',
    };
  }

  /**
   * Resolve `agent_runs.pr_id` from the artifact's repo + PR number (Pass 6).
   * `null` when the PR hasn't been imported into DevDigest yet — the caller
   * leaves `prId` null rather than fabricating a FK (`pull_requests.id` has
   * no synthetic-row fallback; `ci_runs.pr_number` still carries the number
   * regardless of whether this resolves).
   */
  async findPrId(workspaceId: string, repoFullName: string, prNumber: number): Promise<string | null> {
    const [row] = await this.db
      .select({ id: t.pullRequests.id })
      .from(t.pullRequests)
      .innerJoin(t.repos, eq(t.pullRequests.repoId, t.repos.id))
      .where(
        and(
          eq(t.repos.workspaceId, workspaceId),
          eq(t.repos.fullName, repoFullName),
          eq(t.pullRequests.number, prNumber),
        ),
      );
    return row?.id ?? null;
  }

  /**
   * Dual-write (Pass 6, ADDENDUM v2 decision 2) — the ONLY writer of
   * `agent_runs(source='ci')` and `ci_runs` in this feature. Both inserts are
   * one transaction: a failure partway through (e.g. the second insert
   * throwing) must not leave an orphaned `agent_runs` row with no matching
   * `ci_runs` projection, mirroring the delete-then-insert transactions
   * elsewhere in this codebase (`modules/agents/repository.ts:setSkills`,
   * `modules/pulls/repository.ts:replaceDetail`).
   *
   * W3 — idempotent on `(installationId, commitSha)`: a re-delivered ingest
   * for a commit already recorded (GitHub Actions retries, at-least-once
   * webhook semantics, etc.) returns the EXISTING pair instead of inserting a
   * second one. Select-then-insert (not `onConflictDoUpdate`) — same
   * accepted TOCTOU tradeoff as `upsertInstallation` above; the DB-level
   * unique constraint (`ci_runs_installation_commit_unique`) is the actual
   * backstop against a true race.
   */
  async ingestResult(input: IngestResultInput): Promise<IngestedResult> {
    const [existing] = await this.db
      .select()
      .from(t.ciRuns)
      .where(
        and(eq(t.ciRuns.ciInstallationId, input.installationId), eq(t.ciRuns.commitSha, input.commitSha)),
      );
    if (existing) {
      return { agentRunId: existing.agentRunId ?? '', ciRunId: existing.id };
    }

    return this.db.transaction(async (tx) => {
      const [run] = await tx
        .insert(t.agentRuns)
        .values({
          workspaceId: input.workspaceId,
          agentId: input.agentId,
          prId: input.prId,
          durationMs: input.durationMs,
          costUsd: input.costUsd,
          status: 'done',
          source: 'ci',
          findingsCount: input.findingsCount,
          blockers: input.blockers,
        })
        .returning();

      const [ciRun] = await tx
        .insert(t.ciRuns)
        .values({
          ciInstallationId: input.installationId,
          prNumber: input.prNumber,
          ranAt: new Date(),
          status: input.status,
          findingsCount: input.findingsCount,
          costUsd: input.costUsd,
          githubUrl: input.githubUrl,
          source: 'ci',
          durationMs: input.durationMs,
          verdict: input.verdict,
          commitSha: input.commitSha,
          agentRunId: run!.id,
        })
        .returning();

      return { agentRunId: run!.id, ciRunId: ciRun!.id };
    });
  }
}
