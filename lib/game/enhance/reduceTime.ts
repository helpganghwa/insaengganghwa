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
export type ReduceTimeInput = { userId: string; jobId: bigint; diamonds: number };
export type ReduceTimeResult = { completeAt: Date; reducedMs: number; ready: boolean };

export function reduceEnhanceTime(input: ReduceTimeInput): Promise<ReduceTimeResult> {
  const { userId, jobId } = input;
  const diamonds = Math.floor(input.diamonds);
  // NaN/Infinity 방어 — Number.isInteger는 NaN·Infinity에 false(BigInt(NaN) 크래시 차단).
  if (!Number.isInteger(diamonds) || diamonds < 1) throw new EnhanceError('INSUFFICIENT_DIAMOND');

  return db.transaction(async (tx) => {
    const [job] = await tx
      .select({ id: enhancementJobs.id, serverId: enhancementJobs.serverId, completeAt: enhancementJobs.completeAt })
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

    // 실제 필요량으로 상한(서버 시계 기준) — 클라 시계가 앞서거나 완료 직전 레이스일 때
    // 남은 시간보다 많은 다이아가 소각되는 과금 방지. 완료 시각 이미 도달 시 무과금 종료.
    const now = Date.now();
    const remainingMs = job.completeAt.getTime() - now;
    if (remainingMs <= 0) {
      return { completeAt: job.completeAt, reducedMs: 0, ready: true };
    }
    const maxUsefulDiamonds = Math.ceil(remainingMs / GEM_TO_MS);
    const spendDiamonds = Math.min(diamonds, maxUsefulDiamonds);

    // 지갑 차감 — 조건부 UPDATE(부족 시 미차감·false). 실패 경로는 tx 롤백으로 원복.
    // 차감은 잡이 속한 서버 지갑(잡 행 파생) — 활성 서버 위조 요청 무해화.
    const paid = await walletTrySpend(tx, userId, job.serverId, spendDiamonds);
    if (!paid) throw new EnhanceError('INSUFFICIENT_DIAMOND');

    const requestedMs = spendDiamonds * GEM_TO_MS;
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
      serverId: job.serverId,
      gemsSpent: BigInt(spendDiamonds),
      reducedMs: BigInt(effectiveReducedMs),
      conversionMsPerDiamond: BigInt(GEM_TO_MS), // 등록 시점 환산률 스냅샷
    });

    return { completeAt: newCompleteAt, reducedMs: effectiveReducedMs, ready: newCompleteMs <= now };
  });
}
