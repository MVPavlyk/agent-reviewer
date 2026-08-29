/**
 * Pure helpers for the evals module — no Fastify/Drizzle types here.
 */

/** Lowercase, hyphenated slug of a finding title, used as an eval case name. */
export function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'case'
  );
}

/**
 * Resolve a unique case name within an owner's existing case names (OQ-4):
 * the bare slug if free, otherwise `${slug}-2`, `${slug}-3`, ... — the first
 * numeric suffix not already taken.
 */
export function uniqueCaseName(slug: string, existingNames: string[]): string {
  const taken = new Set(existingNames);
  if (!taken.has(slug)) return slug;
  let n = 2;
  while (taken.has(`${slug}-${n}`)) n += 1;
  return `${slug}-${n}`;
}
