import 'server-only';

import { and, eq, inArray, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { equipmentInstances } from '@/lib/db/schema/equipment';
import { enhancementJobs } from '@/lib/db/schema/enhance';
import { transcendLogs } from '@/lib/db/schema/transcend';
import { transcendFodderForStep } from '@/lib/game/balance';

/**
 * 초월 — GDD §3.3 / BALANCE §2 / SCHEMA §4. **즉시·무RNG**(제물 충족 시 100%).
 *
 * - 제물 = 대상과 **같은 카탈로그 아이템**의 다른 개체 (강화·초월 레벨 무관, +0 가능)
 *   · 미장착 · 미잠금 · 강화중 아님 · 강화 제물로 예약 안 됨
 * - 단계 제물 수 = 선형 1→10(BALANCE §2.1), 최대 10초월
 * - 대상 **강화 레벨 유지**(강화·초월 독립 축). 제물 개체 **영구 삭제**
 * - 자원 차감 + 상태 변경 + 로그 = **단일 트랜잭션**(CLAUDE §3.3)
 */
export type TranscendErrorCode =
  | 'EQUIPMENT_NOT_FOUND'
  | 'EQUIPMENT_LOCKED'
  | 'TRANSCEND_MAX'
  | 'INSUFFICIENT_FODDER';

export class TranscendError extends Error {
  constructor(public code: TranscendErrorCode) {
    super(code);
    this.name = 'TranscendError';
  }
}

export type TranscendInput = { userId: string; equipmentInstanceId: bigint };
export type TranscendResult = {
  equipmentInstanceId: bigint;
  fromT: number;
  toT: number;
  fodderConsumed: number;
};

export function performTranscend(input: TranscendInput): Promise<TranscendResult> {
  const { userId, equipmentInstanceId } = input;

  return db.transaction(async (tx) => {
    const [target] = await tx
      .select({
        id: equipmentInstances.id,
        catalogItemId: equipmentInstances.catalogItemId,
        transcendLevel: equipmentInstances.transcendLevel,
        isLocked: equipmentInstances.isLocked,
      })
      .from(equipmentInstances)
      .where(
        and(eq(equipmentInstances.id, equipmentInstanceId), eq(equipmentInstances.userId, userId)),
      )
      .for('update');

    if (!target) throw new TranscendError('EQUIPMENT_NOT_FOUND');
    // T10 cap 제거(사용자 결정 2026-05-21) — 무한 진행 허용. 디자인은 T10과 동일.

    const fromT = target.transcendLevel;
    const toT = fromT + 1;
    const need = transcendFodderForStep(toT);

    // 제물 후보 — 같은 카탈로그 아이템, 대상 제외, 미장착·미잠금·강화중/예약 아님.
    // **약한 순으로 정렬 후 limit** — 비싼 인스턴스(예: T3, +99) 보존(2026-05-31 버그 수정).
    // 이전에는 ORDER BY 없이 DB row 순서대로 잡혀 T3 fodder가 T0→T1 초월에 소비될 수 있었음.
    const fodder = await tx
      .select({ id: equipmentInstances.id })
      .from(equipmentInstances)
      .where(
        and(
          eq(equipmentInstances.userId, userId),
          eq(equipmentInstances.catalogItemId, target.catalogItemId),
          eq(equipmentInstances.isLocked, false),
          sql`${equipmentInstances.id} <> ${equipmentInstanceId}`,
          sql`${equipmentInstances.equippedSlot} is null`,
          sql`not exists (select 1 from ${enhancementJobs} ej
              where ej.equipment_instance_id = ${equipmentInstances.id} and ej.status = 'running')`,
          sql`not exists (select 1 from ${enhancementJobs} ej
              where ej.fodder_instance_id = ${equipmentInstances.id} and ej.status = 'running')`,
        ),
      )
      .orderBy(
        equipmentInstances.transcendLevel,
        equipmentInstances.enhanceLevel,
        equipmentInstances.id,
      )
      .limit(need)
      .for('update');

    if (fodder.length < need) throw new TranscendError('INSUFFICIENT_FODDER');
    const fodderIds = fodder.map((f) => f.id);

    await tx.delete(equipmentInstances).where(inArray(equipmentInstances.id, fodderIds));

    await tx
      .update(equipmentInstances)
      .set({ transcendLevel: toT })
      .where(eq(equipmentInstances.id, equipmentInstanceId));

    await tx.insert(transcendLogs).values({
      userId,
      equipmentInstanceId,
      catalogItemId: target.catalogItemId,
      fromT,
      toT,
      fodderCount: need,
      fodderInstanceIds: fodderIds,
    });

    return { equipmentInstanceId, fromT, toT, fodderConsumed: need };
  });
}
