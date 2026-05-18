import 'server-only';

import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { enhancementJobs } from '@/lib/db/schema/enhance';
import { EnhanceError } from './queue';

/**
 * (D) 강화 취소 — CLAUDE §6.1. `status='running' → 'cancelled'` 조건부 전이.
 * **환불 없음**(강화 무료). 상태 전이로 partial unique 해제 → lane 즉시 free.
 */
export async function cancelEnhance(input: { userId: string; jobId: bigint }): Promise<void> {
  const rows = await db
    .update(enhancementJobs)
    .set({ status: 'cancelled' })
    .where(
      and(
        eq(enhancementJobs.id, input.jobId),
        eq(enhancementJobs.userId, input.userId),
        eq(enhancementJobs.status, 'running'),
      ),
    )
    .returning({ id: enhancementJobs.id });
  if (rows.length === 0) throw new EnhanceError('JOB_NOT_FOUND'); // 이미 완료/취소 → 멱등
}
