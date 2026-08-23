import { db } from '../../db/client';
import { pulls } from '../../db/schema';
import { eq } from 'drizzle-orm';
import { getRepoConfig } from '../repos/repository';
import { getReviewSettings } from '../settings/repository';

export interface AutoMergeDecision {
  eligible: boolean;
  reason?: string;
}

export async function evaluateAutoMerge(owner: string, repo: string, pullId: string): Promise<AutoMergeDecision> {
  const [pull] = await db.select().from(pulls).where(eq(pulls.id, pullId)).limit(1);
  if (!pull) {
    return { eligible: false, reason: 'not_found' };
  }

  const repoConfig = await getRepoConfig(owner, repo);
  if (!repoConfig?.autoMergeEnabled) {
    return { eligible: false, reason: 'auto_merge_disabled' };
  }

  const settings = await getReviewSettings(owner, repo);
  if (settings.minApprovals > pull.approvalCount) {
    return { eligible: false, reason: 'insufficient_approvals' };
  }

  return { eligible: true };
}

export async function markPullQueued(pullId: string): Promise<void> {
  await db.update(pulls).set({ queuedAt: new Date() }).where(eq(pulls.id, pullId));
}
