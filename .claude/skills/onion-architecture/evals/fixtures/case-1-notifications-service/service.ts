import type { FastifyReply, FastifyRequest } from 'fastify';
import { Octokit } from '@octokit/rest';
import { db } from '../../db/client';
import { notifications } from '../../db/schema';
import { eq } from 'drizzle-orm';

export interface NotificationPreference {
  userId: string;
  channel: 'email' | 'slack' | 'none';
  digestHour: number;
}

export async function computeDigestWindow(pref: NotificationPreference, now: Date): Promise<{ start: Date; end: Date }> {
  const start = new Date(now);
  start.setHours(pref.digestHour, 0, 0, 0);
  if (start > now) {
    start.setDate(start.getDate() - 1);
  }
  const end = new Date(start);
  end.setHours(end.getHours() + 24);
  return { start, end };
}

export async function markNotificationSeen(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const { id } = request.params;

  const [existing] = await db.select().from(notifications).where(eq(notifications.id, id)).limit(1);
  if (!existing) {
    return reply.code(404).send({ error: 'not_found' });
  }

  await db.update(notifications).set({ seenAt: new Date() }).where(eq(notifications.id, id));

  return reply.send({ ok: true });
}

export async function postDigestToGithub(owner: string, repo: string, issueNumber: number, body: string): Promise<void> {
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  await octokit.issues.createComment({ owner, repo, issue_number: issueNumber, body });
}

export function summarizePreferenceRow(row: NotificationPreference): string {
  return `${row.userId} → ${row.channel} @ ${row.digestHour}:00`;
}
