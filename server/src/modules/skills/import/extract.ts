import type { SkillType } from '@devdigest/shared';
import { SKILL_DOC_NAMES } from '../constants.js';
import { parseFrontmatter } from './frontmatter.js';
import { sanitize } from './sanitize.js';
import type { SkillDraft, SkillFileEntry } from './types.js';

const VALID_TYPES = new Set<SkillType>(['rubric', 'convention', 'security', 'custom']);

function basename(path: string): string {
  const parts = path.split('/');
  return parts[parts.length - 1] || path;
}

function titleFromPath(path: string): string {
  const name = basename(path).replace(/\.(md|markdown|txt)$/i, '');
  const humanized = name.replace(/[-_]+/g, ' ').trim();
  return humanized || 'Imported Skill';
}

/**
 * Pick the entry that documents the skill: `SKILL.md` (any depth) first,
 * `README.md` next, else — when exactly one markdown file is present — that
 * file, else the alphabetically-first markdown file. Returns undefined when
 * no markdown entry qualifies (e.g. everything was rejected before this ran).
 */
function pickDocEntry(entries: SkillFileEntry[]): SkillFileEntry | undefined {
  const mdEntries = entries.filter((e) => /\.(md|markdown)$/i.test(e.path));
  for (const docName of SKILL_DOC_NAMES) {
    const hit = mdEntries.find((e) => basename(e.path).toLowerCase() === docName.toLowerCase());
    if (hit) return hit;
  }
  if (mdEntries.length === 0) return undefined;
  return [...mdEntries].sort((a, b) => a.path.localeCompare(b.path))[0];
}

/**
 * Extract a `SkillDraft` from decompressed archive entries (or a single-entry
 * array for a plain `.md` upload). Pure — no fs, no fflate, no Fastify.
 *
 * `body` is already `sanitize()`d: decision 5's defense (escape a literal
 * `</untrusted>`, strip control chars, cap length) applies at the earliest
 * point a skill body exists, not only at `POST /skills` — a preview a user
 * never edits and blindly confirms is still safe.
 */
export function extractSkill(entries: SkillFileEntry[]): SkillDraft {
  const doc = pickDocEntry(entries);
  const raw = doc?.text ?? '';
  const { fields, body } = parseFrontmatter(raw);

  const name = fields.name?.trim() || (doc ? titleFromPath(doc.path) : 'Imported Skill');
  const firstLine = body.split(/\r?\n/).find((l) => l.trim().length > 0)?.trim() ?? '';
  const description = fields.description?.trim() || firstLine.slice(0, 200);
  const type = VALID_TYPES.has(fields.type as SkillType) ? (fields.type as SkillType) : 'custom';

  return {
    name,
    description,
    type,
    source: 'extracted',
    body: sanitize(body.trim()),
  };
}
