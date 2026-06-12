import 'server-only';

import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { enhancementJobs, gemTimeReductions } from '@/lib/db/schema/enhance';
import { GEM_TO_MS } from '@/lib/game/balance';
import { walletTrySpend } from '@/lib/game/wallet';
import { EnhanceError } from './queue';

/**
 * (C) 보석(다이아) 시간 단축 — CLAUDE §6.1/§6.3. 1다이아 = 1분(BALANCE §6.2).
 * 환산률은 **이 작업 스냅샷 영구**(소급 금지). completeAt 하한 = now(과단축 방지).
 * 단일 트랜잭션: job 잠금 → 지갑 차감(서버별, SERVER.md) → completeAt 단축 → 이력 기록.
 */
export type ReduceTimeInput = { userId: string; serverId: number; jobId: bigint; diamonds: number };
export type ReduceTimeResult = { completeAt: Date; reducedMs: number; ready: boolean };

export function reduceEnhanceTime(input: ReduceTimeInput): Promise<ReduceTimeResult> {
  const { userId, jobId } = input;
  const diamonds = Math.floor(input.diamonds);
  if (diamonds < 1) throw new EnhanceError('INSUFFICIENT_DIAMOND');

  return db.transaction(async (tx) => {
    const [job] = await tx
      .select({ id: enhancementJobs.id, completeAt: enhancementJobs.completeAt })
      .from(enhancementJobs)
      .where(
        and(
          eq(enhancementJobs.id, jobId),
          eq(enhancementJobs.userId, userId),
          eq(enhancementJobs.status, 'running'),
        ),
      )
      .for('update');
    if (!job) throw new EnhanceError('JOB_NOT_FOUND');

    // 지갑 차감 — 조건부 UPDATE(부족 시 미차감·false). 실패 경로는 tx 롤백으로 원복.
    const paid = await walletTrySpend(tx, userId, input.serverId, diamonds);
    if (!paid) throw new EnhanceError('INSUFFICIENT_DIAMOND');

    const now = Date.now();
    const requestedMs = diamonds * GEM_TO_MS;
    const newCompleteMs = Math.max(now, job.completeAt.getTime() - requestedMs);
    const effectiveReducedMs = job.completeAt.getTime() - newCompleteMs;
    const newCompleteAt = new Date(newCompleteMs);

    await tx
      .update(enhancementJobs)
      .set({
        completeAt: newCompleteAt,
        totalReducedMs: sql`${enhancementJobs.totalReducedMs} + ${BigInt(effectiveReducedMs)}`,
      })
      .where(eq(enhancementJobs.id, jobId));

    await tx.insert(gemTimeReductions).values({
      jobId,
      userId,
      serverId: input.serverId,
      gemsSpent: BigInt(diamonds),
      reducedMs: BigInt(effectiveReducedMs),
      conversionMsPerDiamond: BigInt(GEM_TO_MS), // 등록 시점 환산률 스냅샷
    });

    return { completeAt: newCompleteAt, reducedMs: effectiveReducedMs, ready: newCompleteMs <= now };
  });
}
