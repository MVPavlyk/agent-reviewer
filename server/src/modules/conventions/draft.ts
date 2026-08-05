import { sanitize } from '../skills/import/sanitize.js';
import type { SkillDraft } from '../skills/import/types.js';
import type { ConventionRow } from './repository.js';

/**
 * Merge accepted conventions into one skill draft — pure, no I/O. One `##`
 * section per convention, each citing its `file:line` evidence. Mirrors
 * `skills/import/extract.ts::extractSkill`'s draft shape and applies the same
 * `sanitize()` defense (decision 5 in docs/specs/skills.md), since this body
 * also enters the prompt as an instruction once saved as a skill.
 *
 * Name/description are a generic starting point, not a final answer — the
 * "Create skill from conventions" modal shows everything as editable before
 * save (per the reference design), so getting these exactly right here isn't
 * load-bearing.
 */
export function buildSkillDraftFromConventions(rows: ConventionRow[]): SkillDraft {
  const sections = rows.map((row) => {
    const location = row.evidencePath
      ? `\`${row.evidencePath}${row.startLine ? `:${row.startLine}` : ''}\``
      : null;
    const snippet = row.evidenceSnippet ? `\n\n\`\`\`\n${row.evidenceSnippet}\n\`\`\`` : null;
    return [`## ${row.title}`, row.rule, location ? `Detected in ${location}` : null, snippet]
      .filter((part): part is string => !!part)
      .join('\n\n');
  });

  const count = rows.length;
  const name = `${count} extracted convention${count === 1 ? '' : 's'}`;
  const description = `Merged from ${count} accepted convention${count === 1 ? '' : 's'}.`;

  return {
    name,
    description,
    type: 'convention',
    source: 'extracted',
    body: sanitize(sections.join('\n\n')),
  };
}
