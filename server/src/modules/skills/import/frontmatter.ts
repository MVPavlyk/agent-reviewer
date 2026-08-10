export interface Frontmatter {
  [key: string]: string;
}

/**
 * Minimal `---\nkey: value\n---` frontmatter parser. We own this ~10-key flat
 * scalar grammar rather than pulling in gray-matter for it. Unquoted, single-
 * and double-quoted scalar values only — no nesting, no lists.
 */
export function parseFrontmatter(text: string): { fields: Frontmatter; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!match) return { fields: {}, body: text };

  const fields: Frontmatter = {};
  for (const line of match[1]!.split(/\r?\n/)) {
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    let value = line.slice(colon + 1).trim();
    const quoted =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"));
    if (quoted && value.length >= 2) value = value.slice(1, -1);
    if (key) fields[key] = value;
  }
  return { fields, body: text.slice(match[0].length) };
}
