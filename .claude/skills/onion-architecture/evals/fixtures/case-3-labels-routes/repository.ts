import { db } from '../../db/client';
import { labels } from '../../db/schema';
import { and, eq } from 'drizzle-orm';

export type LabelRow = typeof labels.$inferSelect;

export async function getLabelRow(owner: string, repo: string, name: string): Promise<LabelRow | undefined> {
  const [row] = await db
    .select()
    .from(labels)
    .where(and(eq(labels.owner, owner), eq(labels.repo, repo), eq(labels.name, name)))
    .limit(1);
  return row;
}
