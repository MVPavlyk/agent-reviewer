import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { Container } from '../../platform/container.js';
import type { ContextDoc, ContextDocContent, ContextDocLink, ContextDocsResponse } from '@devdigest/shared';
import { AppError, NotFoundError, ValidationError } from '../../platform/errors.js';
import { RepoRepository } from '../repos/repository.js';
import type { ContextDocsRepository } from './repository.js';
import { isUnderRoots, normalizeContextDocPath } from './helpers.js';
import { scanContextDocs, type ScannedContextDoc } from './reader.js';
import { resolveContextDocs } from './resolve.js';
import { PREVIEW_MAX_CHARS } from './constants.js';

/**
 * context-docs service (SPEC-01 + SPEC-02, 30-plan.md Крок 6). Owns two
 * in-memory caches, scoped to this service instance's lifetime:
 *  - `scanCache`: the last scan per repo, invalidated by `refreshDocs()`
 *    (AC-7) or a repo id it hasn't seen yet.
 *  - `tokenCache`: passed straight into `scanContextDocs`, keyed by
 *    `content_hash` — an unchanged file is never re-tokenized (AC-10). Kept
 *    at the SERVICE level, not per-repo, because `content_hash` is already
 *    content-derived (two repos sharing an identical file share the cost).
 *
 * §7 risk #3: this cache is in-memory, not a DB table — after a process
 * restart the first scan of a repo with many `.md` files pays the full
 * tokenizer pass again. Accepted trade-off (see 30-plan.md §2/§7); NOT a bug.
 */
interface ScanCacheEntry {
  scannedAt: string;
  docs: ScannedContextDoc[];
}

interface InheritedLinkExtra {
  skill_id: string;
  skill_name: string;
  skill_enabled: true;
}

export class ContextDocsService {
  private repo: ContextDocsRepository;
  private repos: RepoRepository;
  private scanCache = new Map<string, ScanCacheEntry>();
  private tokenCache = new Map<string, number>();

  constructor(private container: Container) {
    this.repo = container.contextDocsRepo;
    this.repos = new RepoRepository(container.db);
  }

  /** `GET /repos/:repoId/context-docs` (AC-5). */
  async listDocs(workspaceId: string, repoId: string): Promise<ContextDocsResponse> {
    const clonePath = await this.requireClonePath(workspaceId, repoId);
    return this.scan(workspaceId, repoId, clonePath, false);
  }

  /** `POST /repos/:repoId/context-docs/refresh` — resets the scan cache for this repo (AC-7). */
  async refreshDocs(workspaceId: string, repoId: string): Promise<ContextDocsResponse> {
    const clonePath = await this.requireClonePath(workspaceId, repoId);
    return this.scan(workspaceId, repoId, clonePath, true);
  }

  /** `GET /repos/:repoId/context-docs/content?path=…` (SPEC-02 AC-7/EC-8). */
  async getContent(workspaceId: string, repoId: string, rawPath: string): Promise<ContextDocContent> {
    const clonePath = await this.requireClonePath(workspaceId, repoId);
    const normalized = normalizeContextDocPath(rawPath);
    if (!normalized) throw new ValidationError('Invalid context doc path');

    let content: string;
    try {
      content = await readFile(join(clonePath, normalized), 'utf8');
    } catch {
      throw new NotFoundError('Context doc not found');
    }

    const truncated = content.length > PREVIEW_MAX_CHARS;
    return {
      path: normalized,
      content: truncated ? content.slice(0, PREVIEW_MAX_CHARS) : content,
      truncated,
    };
  }

  /** `GET /agents/:id/context-docs` — own + inherited (source:'skill') links (SPEC-01 §2 point 2). */
  async agentLinks(workspaceId: string, agentId: string): Promise<ContextDocLink[] | undefined> {
    const agent = await this.container.agentsRepo.getById(workspaceId, agentId);
    if (!agent) return undefined;

    const [ownRows, linkedSkills] = await Promise.all([
      this.repo.listForAgent(agentId),
      this.container.agentsRepo.linkedSkills(agentId),
    ]);
    const skillDocLists = await Promise.all(
      linkedSkills.map((l) => this.repo.listForSkill(l.skill.id)),
    );

    const resolved = resolveContextDocs({
      skills: linkedSkills.map((l, i) => ({
        id: l.skill.id,
        name: l.skill.name,
        enabled: l.skill.enabled,
        order: l.order,
        docs: skillDocLists[i]!.map((d) => ({ path: d.path, order: d.order })),
      })),
      agentDocs: ownRows.map((r) => ({ path: r.path, order: r.order })),
    });

    return resolved.map((r): ContextDocLink => {
      const base = { path: r.path, order: r.order, source: r.source };
      if (r.source !== 'skill') return base;
      const extra: InheritedLinkExtra = {
        skill_id: r.skillId!,
        skill_name: r.skillName!,
        skill_enabled: true,
      };
      return { ...base, ...extra };
    });
  }

  /** `POST /agents/:id/context-docs` — replace-set of the agent's OWN attachments (AC-12, AC-16, AC-17). */
  async setAgentLinks(
    workspaceId: string,
    agentId: string,
    paths: string[],
  ): Promise<ContextDocLink[] | null> {
    const normalized = paths.map((raw) => this.requireDocPath(raw));
    const rows = await this.repo.setForAgent(workspaceId, agentId, normalized);
    if (!rows) return null;
    return this.agentLinks(workspaceId, agentId) as Promise<ContextDocLink[]>;
  }

  /** `GET /skills/:id/context-docs` (AC-13). A skill's own list has no
   *  "inherited" concept — every row is its own direct attachment, so
   *  `source` is always `'agent'` here (the field name is about the OWNER
   *  kind, not literally "an agent"; there is no third value). */
  async skillLinks(workspaceId: string, skillId: string): Promise<ContextDocLink[] | undefined> {
    const skill = await this.container.skillsRepo.getById(workspaceId, skillId);
    if (!skill) return undefined;
    const rows = await this.repo.listForSkill(skillId);
    return rows.map((r) => ({ path: r.path, order: r.order, source: 'agent' as const }));
  }

  /** `POST /skills/:id/context-docs` — replace-set (AC-13, AC-16, AC-17). */
  async setSkillLinks(
    workspaceId: string,
    skillId: string,
    paths: string[],
  ): Promise<ContextDocLink[] | null> {
    const normalized = paths.map((raw) => this.requireDocPath(raw));
    const rows = await this.repo.setForSkill(workspaceId, skillId, normalized);
    if (!rows) return null;
    return rows.map((r) => ({ path: r.path, order: r.order, source: 'agent' as const }));
  }

  // ---- internals -----------------------------------------------------------

  /**
   * Validates AND normalizes one attach-request path (AC-16), and enforces
   * `CONTEXT_DOC_ROOTS` on the write side (EC-17) — a path
   * `GET /repos/:repoId/context-docs` would never have listed must not be
   * attachable either. Returns the canonical path so callers persist that,
   * not the raw string (ARCH-WARNING-2).
   */
  private requireDocPath(raw: string): string {
    const normalized = normalizeContextDocPath(raw);
    if (!normalized) throw new ValidationError(`Invalid context doc path: ${raw}`);
    if (!isUnderRoots(normalized, this.container.config.contextDocRoots)) {
      throw new ValidationError(`Context doc path outside configured roots: ${raw}`);
    }
    return normalized;
  }

  /**
   * Resolves the repo's clone path AND verifies the directory is actually
   * reachable on disk (VERIFIER-SERVER-PARTIAL AC-6/EC-1). `reader.ts`
   * deliberately swallows a `readdir` failure so a clone with no matching
   * `.md` files still returns `200 []` (EC-2) — that same swallow would also
   * hide a clone whose directory was removed after `clone_path` was set, so
   * this check has to happen up front, before scanning, to keep the two
   * cases distinguishable.
   */
  private async requireClonePath(workspaceId: string, repoId: string): Promise<string> {
    const repoRow = await this.repos.getById(workspaceId, repoId);
    if (!repoRow) throw new NotFoundError('Repo not found');
    if (!repoRow.clonePath) {
      throw new AppError('clone_missing', 'Repo has not been cloned yet', 409);
    }
    try {
      const info = await stat(repoRow.clonePath);
      if (!info.isDirectory()) {
        throw new AppError('clone_missing', 'Repo clone path is not a directory', 409);
      }
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError('clone_missing', 'Repo clone directory is unreachable', 409);
    }
    return repoRow.clonePath;
  }

  private async scan(
    workspaceId: string,
    repoId: string,
    clonePath: string,
    forceRefresh: boolean,
  ): Promise<ContextDocsResponse> {
    if (forceRefresh) this.scanCache.delete(repoId);

    let entry = this.scanCache.get(repoId);
    if (!entry) {
      const docs = await scanContextDocs(
        clonePath,
        this.container.config.contextDocRoots,
        this.container.tokenizer,
        this.tokenCache,
      );
      entry = { scannedAt: new Date().toISOString(), docs };
      this.scanCache.set(repoId, entry);
    }

    const paths = entry.docs.map((d) => d.path);
    const usedByAgents = await this.repo.usedByAgents(workspaceId, paths);
    const docs: ContextDoc[] = entry.docs.map((d) => ({
      ...d,
      used_by_agents: usedByAgents.get(d.path) ?? 0,
    }));

    return {
      docs,
      roots: this.container.config.contextDocRoots,
      scanned_at: entry.scannedAt,
    };
  }
}
