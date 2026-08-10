import type { Container } from '../../platform/container.js';
import type {
  ConventionCandidate,
  ConventionsListResponse,
  Skill,
  SkillType,
} from '@devdigest/shared';
import { wrapUntrusted } from '../../platform/prompt.js';
import { sanitize } from '../skills/import/sanitize.js';
import type { SkillDraft } from '../skills/import/types.js';
import { toSkillDto } from '../skills/helpers.js';
import { CONVENTION_SAMPLE_FILE_COUNT } from '../repo-intel';
import { ConventionsRepository } from './repository.js';
import { toConventionDto, toScanSummaryDto } from './helpers.js';
import { buildSkillDraftFromConventions } from './draft.js';
import { DetectedConventionsSchema } from './llm-schema.js';
import {
  DETECT_CONVENTIONS_JOB_KIND,
  DETECTION_MODEL,
  DETECTION_PROVIDER,
  DETECTION_SYSTEM_PROMPT,
} from './constants.js';

/**
 * Conventions service — detect a repo's coding conventions (repo-intel
 * candidates + an LLM call) and merge accepted suggestions into a real skill.
 *
 * Detection is manual-only (see docs plan): a "Re-scan" enqueues a job on the
 * shared JobRunner rather than running inline, and is never triggered by a
 * PR review run.
 */

export interface RescanResult {
  status: 'accepted';
  job_id: string | null;
  scan_id: string;
}

interface DetectionJobPayload {
  workspaceId: string;
  repoId: string;
  scanId: string;
}

export interface CreateSkillFromConventionsInput {
  convention_ids: string[];
  name: string;
  description: string;
  type: SkillType;
  body: string;
}

export class ConventionsService {
  private repo: ConventionsRepository;

  constructor(private container: Container) {
    this.repo = container.conventionsRepo;
  }

  async list(workspaceId: string, repoId: string): Promise<ConventionsListResponse> {
    const [rows, latestScan] = await Promise.all([
      this.repo.listByRepo(workspaceId, repoId),
      this.repo.getLatestScan(workspaceId, repoId),
    ]);
    return {
      conventions: rows.map(toConventionDto),
      latest_scan: latestScan ? toScanSummaryDto(latestScan) : null,
    };
  }

  /**
   * Enqueue a detection scan. Idempotent: a scan already running for this
   * repo is returned as-is instead of starting a second one — two concurrent
   * scans would race a delete-then-insert against the same repo's pending
   * rows, the same shape of bug that once deadlocked repo-intel indexing
   * (server/INSIGHTS.md).
   */
  async rescan(workspaceId: string, repoId: string): Promise<RescanResult> {
    const running = await this.repo.getRunningScan(repoId);
    if (running) {
      return { status: 'accepted', job_id: null, scan_id: running.id };
    }

    const scan = await this.repo.insertScan(workspaceId, repoId);
    let jobId: string | null = null;
    try {
      const job = await this.container.jobs.enqueue(workspaceId, DETECT_CONVENTIONS_JOB_KIND, {
        workspaceId,
        repoId,
        scanId: scan.id,
      } satisfies DetectionJobPayload);
      jobId = job.id;
    } catch (err) {
      await this.repo.updateScan(scan.id, {
        status: 'failed',
        error: `Could not enqueue detection job: ${(err as Error).message}`,
        finishedAt: new Date(),
      });
    }
    return { status: 'accepted', job_id: jobId, scan_id: scan.id };
  }

  /** Registers the job handler once, at plugin load (mirrors
   *  `RepoIntelService.registerIndexJobHandlers()` called from repo-intel's routes). */
  registerJobHandler(): void {
    this.container.jobs.register(DETECT_CONVENTIONS_JOB_KIND, async (payload) => {
      const { workspaceId, repoId, scanId } = payload as DetectionJobPayload;
      await this.runDetectionJob(workspaceId, repoId, scanId);
    });
  }

  /**
   * The detection pipeline: repo-intel candidate files → file content →
   * LLM structured-output call → validate → wipe-pending + insert. Never
   * throws — every exit path (including failure) updates the scan row so the
   * client's poll always terminates.
   */
  async runDetectionJob(workspaceId: string, repoId: string, scanId: string): Promise<void> {
    try {
      const paths = await this.container.repoIntel.getConventionSamples(
        repoId,
        CONVENTION_SAMPLE_FILE_COUNT,
      );
      const files = await this.container.repoIntel.getFileContents(repoId, paths);
      if (files.length === 0) {
        await this.repo.updateScan(scanId, {
          status: 'failed',
          error: 'no sample files available',
          finishedAt: new Date(),
        });
        return;
      }

      const decided = await this.repo.nonPendingByRepo(repoId);
      const exclusionDigest = decided.length
        ? decided.map((d) => `- [${d.status}] ${d.title}: ${d.rule}`).join('\n')
        : 'None yet.';

      const filesBlock = files
        .map((f) => wrapUntrusted(`file:${f.path}`, `// ${f.path}\n${f.content}`))
        .join('\n\n');

      const llm = await this.container.llm(DETECTION_PROVIDER);
      const result = await llm.completeStructured({
        model: DETECTION_MODEL,
        schema: DetectedConventionsSchema,
        schemaName: 'DetectedConventions',
        temperature: 0.2,
        maxRetries: 2,
        messages: [
          { role: 'system', content: DETECTION_SYSTEM_PROMPT },
          {
            role: 'user',
            content:
              `## Already decided — do not re-suggest\n${exclusionDigest}\n\n` +
              `## Sampled files\n${filesBlock}`,
          },
        ],
      });

      // Defend against a hallucinated path or an inverted line range before
      // persisting — the model is untrusted input here just like a diff.
      const validPaths = new Set(files.map((f) => f.path));
      const rows = result.data.conventions
        .filter((c) => validPaths.has(c.file))
        .map((c) => ({
          workspaceId,
          repoId,
          scanId,
          title: c.title,
          rule: c.rule,
          evidencePath: c.file,
          startLine: c.start_line,
          endLine: Math.max(c.end_line, c.start_line),
          evidenceSnippet: c.snippet,
          confidence: c.confidence,
        }));

      // Rescan semantics: wipe only PENDING rows — accepted/rejected rows are
      // the user's durable decisions and are never touched by a rescan.
      await this.repo.deletePending(repoId);
      await this.repo.insertMany(rows);
      await this.repo.updateScan(scanId, {
        status: 'done',
        sampleFileCount: files.length,
        candidateCount: rows.length,
        finishedAt: new Date(),
      });
    } catch (err) {
      await this.repo.updateScan(scanId, {
        status: 'failed',
        error: (err as Error).message,
        finishedAt: new Date(),
      });
    }
  }

  async accept(workspaceId: string, id: string): Promise<ConventionCandidate | undefined> {
    const row = await this.repo.updateStatus(workspaceId, id, 'accepted');
    return row ? toConventionDto(row) : undefined;
  }

  async reject(workspaceId: string, id: string): Promise<ConventionCandidate | undefined> {
    const row = await this.repo.updateStatus(workspaceId, id, 'rejected');
    return row ? toConventionDto(row) : undefined;
  }

  /** "Deselect all" — bulk-revert every accepted convention in a repo back to
   *  pending. Returns how many were reset. */
  async resetAccepted(workspaceId: string, repoId: string): Promise<number> {
    return this.repo.resetAcceptedByRepo(workspaceId, repoId);
  }

  /** Stateless merge preview for the "Create skill from conventions" modal —
   *  no row is created, mirrors `SkillsService.previewImport`. */
  async getSkillDraft(workspaceId: string, ids: string[]): Promise<SkillDraft | undefined> {
    const rows = await this.repo.getByIds(workspaceId, ids);
    if (rows.length === 0) return undefined;
    return buildSkillDraftFromConventions(rows);
  }

  /** Create the real skill row from the (possibly user-edited) draft. Reuses
   *  `container.skillsRepo` directly rather than duplicating skill-insert
   *  logic — the same pattern `ReviewRunExecutor` uses for `run_skills`.
   *  The merged conventions are then removed from the review queue — their
   *  content now lives in the skill, so leaving them listed would let the
   *  same accepted candidate be merged into a second skill by mistake. */
  async createSkillFromConventions(
    workspaceId: string,
    input: CreateSkillFromConventionsInput,
  ): Promise<Skill> {
    const rows = await this.repo.getByIds(workspaceId, input.convention_ids);
    const evidenceFiles = [
      ...new Set(rows.map((r) => r.evidencePath).filter((p): p is string => !!p)),
    ];

    const row = await this.container.skillsRepo.insert({
      workspaceId,
      name: input.name,
      description: input.description,
      type: input.type,
      source: 'extracted',
      body: sanitize(input.body),
      evidenceFiles,
    });
    await this.repo.deleteByIds(workspaceId, input.convention_ids);
    const withStats = await this.container.skillsRepo.getById(workspaceId, row.id);
    return toSkillDto(withStats!);
  }
}
