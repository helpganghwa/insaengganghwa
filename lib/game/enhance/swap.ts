import 'server-only';

import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { enhancementJobs } from '@/lib/db/schema/enhance';
import { EnhanceError, queueEnhanceInTx, type QueueEnhanceResult } from './queue';

/**
 * (D+A) 슬롯 교체 — CLAUDE §6.1. (D)취소 + (A)등록을 **단일 트랜잭션**.
 * 부위 2 lane이 모두 차서 새 강화를 못 걸 때, 진행 중 1건을 취소하고 같은 lane에
 * 선택 장비를 큐잉. 취소는 running 조건부 전이, INSERT는 같은 tx라 partial unique 통과.
 */
export function swapEnhance(input: {
  userId: string;
  cancelJobId: bigint;
  equipmentInstanceId: bigint;
}): Promise<QueueEnhanceResult> {
  const { userId, cancelJobId, equipmentInstanceId } = input;

  return db.transaction(async (tx) => {
    const cancelled = await tx
      .update(enhancementJobs)
      .set({ status: 'cancelled' })
      .where(
        and(
          eq(enhancementJobs.id, cancelJobId),
          eq(enhancementJobs.userId, userId),
          eq(enhancementJobs.status, 'running'),
        ),
      )
      .returning({ id: enhancementJobs.id });
    if (cancelled.length === 0) throw new EnhanceError('JOB_NOT_FOUND');

    return queueEnhanceInTx(tx, { userId, equipmentInstanceId });
  });
}
