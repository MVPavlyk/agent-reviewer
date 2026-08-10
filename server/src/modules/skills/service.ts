import type { Container } from '../../platform/container.js';
import type { Skill, SkillSource, SkillStats, SkillType, SkillVersion } from '@devdigest/shared';
import { SkillsRepository } from './repository.js';
import { toSkillDto, toSkillVersionDto } from './helpers.js';
import { sanitize } from './import/sanitize.js';
import { extractSkill } from './import/extract.js';
import type { IgnoredEntry, SkillDraft, SkillFileEntry } from './import/types.js';
import { STATS_WINDOW_DAYS } from './constants.js';

/**
 * A1 — skills service. Business logic for the `/skills` page.
 *
 * A Skill = name + description + type + source + body + enabled. Body edits
 * are versioned via `skill_versions` (repository). `sanitize()` runs on every
 * body regardless of route, so an unsanitized body can't be laundered through
 * the plain `POST /skills` (only the import preview path was the obvious one).
 */

export { toSkillDto } from './helpers.js';

export interface CreateSkillInput {
  name: string;
  description: string;
  type: SkillType;
  source: SkillSource;
  body: string;
  enabled?: boolean;
  evidence_files?: string[];
}

export interface UpdateSkillInput {
  name?: string;
  description?: string;
  type?: SkillType;
  source?: SkillSource;
  body?: string;
  enabled?: boolean;
  evidence_files?: string[];
  change_summary?: string | null;
}

export interface ImportPreviewInput {
  filename: string;
  content_base64: string;
}

export interface ImportPreviewResult {
  draft: SkillDraft;
  ignored_entries: IgnoredEntry[];
  warnings: string[];
}

export class SkillsService {
  private repo: SkillsRepository;

  constructor(private container: Container) {
    this.repo = container.skillsRepo;
  }

  async list(workspaceId: string): Promise<Skill[]> {
    const rows = await this.repo.list(workspaceId);
    return rows.map(toSkillDto);
  }

  async get(workspaceId: string, id: string): Promise<Skill | undefined> {
    const row = await this.repo.getById(workspaceId, id);
    return row ? toSkillDto(row) : undefined;
  }

  /** Delete a skill (and its versions/agent-links, via cascade). */
  async delete(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.deleteById(workspaceId, id);
  }

  async create(workspaceId: string, input: CreateSkillInput): Promise<Skill> {
    const row = await this.repo.insert({
      workspaceId,
      name: input.name,
      description: input.description,
      type: input.type,
      source: input.source,
      body: sanitize(input.body),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(input.evidence_files !== undefined ? { evidenceFiles: input.evidence_files } : {}),
    });
    // Refetch through getById for the stats join (agents_count/pull_rate/
    // accept_rate) — always zero for a brand-new skill, but this keeps a
    // single code path for row → DTO rather than special-casing "new".
    const withStats = await this.repo.getById(workspaceId, row.id);
    return toSkillDto(withStats!);
  }

  async update(
    workspaceId: string,
    id: string,
    patch: UpdateSkillInput,
  ): Promise<Skill | undefined> {
    const row = await this.repo.update(workspaceId, id, {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.type !== undefined ? { type: patch.type } : {}),
      ...(patch.source !== undefined ? { source: patch.source } : {}),
      ...(patch.body !== undefined ? { body: sanitize(patch.body) } : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
      ...(patch.evidence_files !== undefined ? { evidenceFiles: patch.evidence_files } : {}),
      ...(patch.change_summary !== undefined ? { changeSummary: patch.change_summary } : {}),
    });
    if (!row) return undefined;
    const withStats = await this.repo.getById(workspaceId, id);
    return withStats ? toSkillDto(withStats) : undefined;
  }

  // ---- Versions (docs/specs/skills.md Extension) ---------------------------

  /** All body snapshots for a skill, newest first. Undefined when the skill
   *  doesn't exist in this workspace (→ 404 at the route). */
  async listVersions(workspaceId: string, id: string): Promise<SkillVersion[] | undefined> {
    const owned = await this.repo.getById(workspaceId, id);
    if (!owned) return undefined;
    const rows = await this.repo.listVersions(id);
    return rows.map(toSkillVersionDto);
  }

  /**
   * Restore = COPY-FORWARD, never rewrite (decision E2). Loads the old
   * snapshot's body and runs it back through the ordinary update() bump/
   * snapshot path, so "restore v4" when current is v5 creates v6 — history
   * is never lost, and a `restoreVersion(currentVersion)` is a legitimate
   * no-op (bodies are equal → no new version).
   */
  async restoreVersion(
    workspaceId: string,
    id: string,
    version: number,
  ): Promise<Skill | undefined> {
    const owned = await this.repo.getById(workspaceId, id);
    if (!owned) return undefined;
    const snapshot = await this.repo.getVersion(id, version);
    if (!snapshot) return undefined;
    const row = await this.repo.update(workspaceId, id, { body: sanitize(snapshot.body) });
    if (!row) return undefined;
    const withStats = await this.repo.getById(workspaceId, id);
    return withStats ? toSkillDto(withStats) : undefined;
  }

  // ---- Stats -----------------------------------------------------------

  /** Findings-by-category breakdown + usage stats for the Stats tab. Undefined
   *  when the skill doesn't exist in this workspace (→ 404 at the route). */
  async getStats(workspaceId: string, id: string): Promise<SkillStats | undefined> {
    const result = await this.repo.getStats(workspaceId, id, STATS_WINDOW_DAYS);
    if (!result) return undefined;
    return {
      agents_count: result.agentsCount,
      pull_rate: result.pullRate,
      accept_rate: result.acceptRate,
      findings_by_category: result.findingsByCategory.map((r) => ({
        category: r.category,
        count: r.count,
        cost_usd: r.costUsd,
      })),
      total_cost_usd: result.totalCostUsd,
      window_days: result.windowDays,
    };
  }

  /**
   * Preview an import — no draft row (see docs/specs/skills.md: no drafts
   * table, the user edits the draft client-side, nothing to garbage-collect).
   * `.zip` goes through the archive adapter (rim, in-memory, filtered before
   * inflating); a plain `.md` upload is a single virtual entry. Either way the
   * SAME pure `extractSkill` picks the doc and returns an already-sanitized
   * draft.
   */
  previewImport(input: ImportPreviewInput): ImportPreviewResult {
    const bytes = Buffer.from(input.content_base64, 'base64');
    const isZip = input.filename.toLowerCase().endsWith('.zip');

    const { entries, ignored } = isZip
      ? this.container.archive.read(new Uint8Array(bytes))
      : { entries: [{ path: input.filename, text: bytes.toString('utf8') }] as SkillFileEntry[], ignored: [] as IgnoredEntry[] };

    const draft = extractSkill(entries);
    const warnings =
      entries.length === 0
        ? ['No markdown skill document found in the upload — draft is empty.']
        : [];

    return { draft, ignored_entries: ignored, warnings };
  }
}
