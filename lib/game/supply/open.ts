import 'server-only';

import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { catalogItems, userEquipment, type Slot } from '@/lib/db/schema/equipment';
import { userSupplyBoxes, supplyOpenLogs } from '@/lib/db/schema/supply';
import { transcendLogs } from '@/lib/db/schema/transcend';
import { transcendFodderForStep } from '@/lib/game/balance';
import { logMemberAchievement } from '@/lib/game/guild/achievement';
import { logWorldEvent } from '@/lib/game/world/event';
import { refreshEnhanceMetrics } from '@/lib/game/leaderboard/incremental';

/**
 * 보급 상자 열기 — GDD §3.4 / BALANCE §4 / SCHEMA §5.
 * 슬롯 일치 박스 → 해당 슬롯 활성 카탈로그 **균등 랜덤** 1개. 카탈로그당 1레코드:
 *  - 미보유 → 획득(+0/T0)
 *  - 보유 → transcend_progress +1 → 임계(선형 T→T+1 = T+1) 도달 시 **자동 초월**(다중 가능)
 * count 차감 + 레코드 갱신 + (자동초월 로그) + 열기 로그 = 단일 트랜잭션(CLAUDE §3.3).
 */
export type SupplyErrorCode = 'NO_BOX' | 'NO_CATALOG';
export class SupplyError extends Error {
  constructor(public code: SupplyErrorCode) {
    super(code);
    this.name = 'SupplyError';
  }
}

export type OpenResult = {
  catalogItemId: number;
  /** 도감 신규 해금(최초 획득) 여부. */
  isNew: boolean;
  /** 이번 열기로 자동 초월된 단계 수(중복일 때 0 이상). */
  transcended: number;
  /** 결과 초월 레벨. */
  transcendLevel: number;
  /** 결과 초월 진행도(다음 초월 임계 = transcendLevel+1). 게이지용. */
  transcendProgress: number;
};

function rngU32(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]!;
}

export async function openSupplyBoxes(input: {
  userId: string;
  serverId: number;
  slot: Slot;
  count?: number;
}): Promise<OpenResult[]> {
  const { userId, serverId, slot } = input;
  const n = Math.max(1, Math.floor(input.count ?? 1));

  const opened = await db.transaction(async (tx) => {
    const [box] = await tx
      .select({ count: userSupplyBoxes.count })
      .from(userSupplyBoxes)
      .where(
        and(
          eq(userSupplyBoxes.userId, userId),
          eq(userSupplyBoxes.serverId, serverId),
          eq(userSupplyBoxes.slot, slot),
        ),
      )
      .for('update');
    if (!box || box.count < BigInt(n)) throw new SupplyError('NO_BOX');

    const pool = await tx
      .select({ id: catalogItems.id })
      .from(catalogItems)
      .where(and(eq(catalogItems.slot, slot), eq(catalogItems.active, true)));
    if (pool.length === 0) throw new SupplyError('NO_CATALOG');

    const results: OpenResult[] = [];

    for (let i = 0; i < n; i++) {
      // 슬롯 내 균등 (BALANCE §4.2).
      const catalogItemId = pool[rngU32() % pool.length]!.id;

      const [existing] = await tx
        .select({
          id: userEquipment.id,
          transcendLevel: userEquipment.transcendLevel,
          transcendProgress: userEquipment.transcendProgress,
          maxTranscendLevel: userEquipment.maxTranscendLevel,
        })
        .from(userEquipment)
        .where(
          and(
            eq(userEquipment.userId, userId),
            eq(userEquipment.serverId, serverId),
            eq(userEquipment.catalogItemId, catalogItemId),
          ),
        )
        .for('update');

      let isNew = false;
      let transcended = 0;
      let transcendLevel = 0;
      let transcendProgress = 0;

      if (!existing) {
        // 최초 획득 — 도감 해금.
        await tx
          .insert(userEquipment)
          .values({ userId, serverId, catalogItemId })
          .onConflictDoNothing();
        isNew = true;
      } else {
        // 중복 — 초월 진행도 +1 후 임계 도달분 자동 초월(선형 T→T+1 = T+1개).
        let progress = existing.transcendProgress + 1;
        let tLevel = existing.transcendLevel;
        const fromTByStep: number[] = [];
        while (progress >= transcendFodderForStep(tLevel + 1)) {
          progress -= transcendFodderForStep(tLevel + 1);
          fromTByStep.push(tLevel);
          tLevel += 1;
          transcended += 1;
        }
        transcendLevel = tLevel;
        transcendProgress = progress;

        const raisedMax = tLevel > existing.maxTranscendLevel;
        await tx
          .update(userEquipment)
          .set({
            transcendProgress: progress,
            transcendLevel: tLevel,
            ...(raisedMax
              ? { maxTranscendLevel: tLevel, maxTranscendReachedAt: sql`now()` }
              : {}),
          })
          .where(eq(userEquipment.id, existing.id));

        // 자동 초월 단계별 감사 로그.
        for (const fromT of fromTByStep) {
          await tx.insert(transcendLogs).values({
            userId,
            serverId,
            userEquipmentId: existing.id,
            catalogItemId,
            fromT,
            toT: fromT + 1,
            fodderCount: transcendFodderForStep(fromT + 1),
          });
        }
      }

      await tx.insert(supplyOpenLogs).values({ userId, serverId, slot, catalogItemId, isNew });

      results.push({ catalogItemId, isNew, transcended, transcendLevel, transcendProgress });
    }

    await tx
      .update(userSupplyBoxes)
      .set({ count: sql`${userSupplyBoxes.count} - ${BigInt(n)}` })
      .where(
        and(
          eq(userSupplyBoxes.userId, userId),
          eq(userSupplyBoxes.serverId, serverId),
          eq(userSupplyBoxes.slot, slot),
        ),
      );

    return results;
  });

  // 길드 업적 — 초월 10단위 돌파 시 길드 피드에 노출(best-effort, 트랜잭션 밖).
  try {
    for (const r of opened) {
      const fromT = r.transcendLevel - r.transcended;
      // 초월 색 등급 경계(11·21·31…)에 올라설 때만 기록. tier index = floor((level-1)/10),
      // 일반(1~10, index 0)은 제외 — 희귀(11)부터 등급 상승 시점을 마일스톤으로.
      const nt = Math.floor((r.transcendLevel - 1) / 10);
      const pt = Math.floor((fromT - 1) / 10);
      if (r.transcended > 0 && nt >= 1 && nt > pt) {
        const milestone = nt * 10 + 1; // 11, 21, 31, 41…(등급 시작 레벨)
        const [ci] = (await db.execute(
          sql`select name from catalog_items where id = ${r.catalogItemId} limit 1`,
        )) as unknown as { name: string }[];
        await logMemberAchievement(userId, serverId, {
          action: 'achv_transcend',
          detail: { item: ci?.name ?? '장비', level: milestone },
        });
        await logWorldEvent(serverId, 'transcend', { item: ci?.name ?? '장비', level: milestone }, { actorUserId: userId });
      }
    }
  } catch {
    // 업적 기록 실패 무시.
  }

  // 리더보드 증분 갱신(v2) — 신규 획득·자동초월이 combat을 바꾼다(트랜잭션 밖 best-effort).
  // 실패는 시간별 전체 재계산(cron)이 교정.
  try {
    await refreshEnhanceMetrics(userId, serverId);
  } catch {
    // cron 백스톱.
  }

  return opened;
}
