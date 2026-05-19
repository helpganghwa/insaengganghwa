import 'server-only';

import { and, eq, lte, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { equipmentInstances, userCodex } from '@/lib/db/schema/equipment';
import { enhancementJobs, enhancementLogs } from '@/lib/db/schema/enhance';
import { effectiveRateBp, failOutcome, levelAfterFail } from '@/lib/game/balance';
import { EnhanceError } from './queue';

/**
 * (B) 강화 큐 완료 — CLAUDE §6.2. 서버 시계만 신뢰, RNG는 완료 시점 서버에서만(§3.1).
 * 멱등: `for update` + `status='running' → 'completed'` 조건부 전이.
 *
 * - 유저 시도(`requireComplete:false`): 언제든 시도 가능, effective = base×(경과/총) (일찍=도박)
 * - cron/lazy(`requireComplete:true`): `completeAt <= now()` 인 큐만 (full rate)
 * 결과: 성공(+1) / 유지(안전 실패) / 하락(−1, +52~). **파괴 없음**.
 */
export type ResolveInput = {
  jobId: bigint;
  /** 유저 시도 시 본인 검증. cron은 생략. */
  userId?: string;
  /** true면 완료 시각 도달한 큐만(cron). false면 조기 시도 허용(유저). */
  requireComplete: boolean;
};

export type ResolveOutcome = 'success' | 'hold' | 'down';
export type ResolveResult = {
  jobId: bigint;
  equipmentInstanceId: bigint;
  outcome: ResolveOutcome;
  fromLevel: number;
  toLevel: number;
  effectiveRateBp: number;
};

function rollBp(): number {
  // CLAUDE §3.1 — crypto RNG, 0..9999.
  return crypto.getRandomValues(new Uint32Array(1))[0]! % 10000;
}

export function resolveEnhance(input: ResolveInput): Promise<ResolveResult> {
  const { jobId, userId, requireComplete } = input;

  return db.transaction(async (tx) => {
    const conds = [eq(enhancementJobs.id, jobId), eq(enhancementJobs.status, 'running')];
    if (userId) conds.push(eq(enhancementJobs.userId, userId));
    if (requireComplete) conds.push(lte(enhancementJobs.completeAt, sql`now()`));

    const [job] = await tx
      .select({
        id: enhancementJobs.id,
        userId: enhancementJobs.userId,
        equipmentInstanceId: enhancementJobs.equipmentInstanceId,
        fromLevel: enhancementJobs.fromLevel,
        baseRateBp: enhancementJobs.baseRateBp,
        durationMs: enhancementJobs.durationMs,
        startedAt: enhancementJobs.startedAt,
        completeAt: enhancementJobs.completeAt,
        totalReducedMs: enhancementJobs.totalReducedMs,
        fodderInstanceId: enhancementJobs.fodderInstanceId,
      })
      .from(enhancementJobs)
      .where(and(...conds))
      .for('update');

    if (!job) throw new EnhanceError('JOB_NOT_FOUND'); // 이미 정산/취소 → 멱등 no-op

    const [{ catalogItemId }] = await tx
      .select({ catalogItemId: equipmentInstances.catalogItemId })
      .from(equipmentInstances)
      .where(eq(equipmentInstances.id, job.equipmentInstanceId))
      .for('update');

    // 서버 시계 기준 경과/총 (총 = completeAt - startedAt, 단축분은 completeAt에 반영됨).
    const now = Date.now();
    const startMs = job.startedAt.getTime();
    const endMs = job.completeAt.getTime();
    const totalMs = Math.max(1, endMs - startMs);
    const elapsedMs = Math.min(totalMs, Math.max(0, now - startMs));
    const effBp = effectiveRateBp(job.baseRateBp, elapsedMs, totalMs);

    const rolled = rollBp();
    const fromLevel = job.fromLevel;
    let outcome: ResolveOutcome;
    let toLevel: number;
    if (rolled < effBp) {
      outcome = 'success';
      toLevel = fromLevel + 1;
    } else if (failOutcome(fromLevel) === 'down') {
      outcome = 'down';
      toLevel = levelAfterFail(fromLevel);
    } else {
      outcome = 'hold';
      toLevel = fromLevel;
    }

    if (toLevel !== fromLevel) {
      await tx
        .update(equipmentInstances)
        .set({ enhanceLevel: toLevel })
        .where(eq(equipmentInstances.id, job.equipmentInstanceId));
    }

    // +100 제물 소모 — 성공·실패 무관 (BALANCE §1.1).
    if (job.fodderInstanceId !== null) {
      await tx.delete(equipmentInstances).where(eq(equipmentInstances.id, job.fodderInstanceId));
    }

    // 도감강화합 소스 — 카탈로그 아이템별 최고 강화(GREATEST) upsert.
    // 신기록(toLevel > 기존 max)일 때만 max_enhance_reached_at = now()
    // (아이템별 랭킹 동률 타이브레이크, SCHEMA §2.3 / BALANCE §3.3). SET 식은
    // 모두 OLD 행 기준 평가 → reached_at CASE가 갱신 전 max를 정확히 비교.
    // 신규 insert는 컬럼 default now()로 자동(그 레벨 최초 달성 = 지금).
    await tx
      .insert(userCodex)
      .values({ userId: job.userId, catalogItemId, maxEnhanceLevel: toLevel })
      .onConflictDoUpdate({
        target: [userCodex.userId, userCodex.catalogItemId],
        set: {
          maxEnhanceLevel: sql`greatest(${userCodex.maxEnhanceLevel}, ${toLevel})`,
          maxEnhanceReachedAt: sql`case when ${toLevel} > ${userCodex.maxEnhanceLevel} then now() else ${userCodex.maxEnhanceReachedAt} end`,
        },
      });

    await tx.insert(enhancementLogs).values({
      userId: job.userId,
      equipmentInstanceId: job.equipmentInstanceId,
      catalogItemId,
      fromLevel,
      toLevel,
      result: outcome,
      baseRateBp: job.baseRateBp,
      effectiveRateBp: effBp,
      elapsedMs: BigInt(elapsedMs),
      durationMs: job.durationMs,
      reducedMs: job.totalReducedMs,
      fodderInstanceId: job.fodderInstanceId,
      rolled,
    });

    // 멱등 조건부 전이.
    await tx
      .update(enhancementJobs)
      .set({ status: 'completed' })
      .where(and(eq(enhancementJobs.id, jobId), eq(enhancementJobs.status, 'running')));

    return {
      jobId,
      equipmentInstanceId: job.equipmentInstanceId,
      outcome,
      fromLevel,
      toLevel,
      effectiveRateBp: effBp,
    };
  });
}
