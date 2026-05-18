import 'server-only';

import { and, eq, sql } from 'drizzle-orm';
import type { PgTransaction } from 'drizzle-orm/pg-core';

import { db } from '@/lib/db/client';
import { catalogItems, equipmentInstances } from '@/lib/db/schema/equipment';
import { enhancementJobs } from '@/lib/db/schema/enhance';
import {
  baseSuccessRateBp,
  enhanceDurationMs,
  FODDER_REQUIRED_FROM_LEVEL,
} from '@/lib/game/balance';

/**
 * (A) 강화 큐 등록 — CLAUDE §6.1. **강화 시도는 무료**(자원 비용 없음, BALANCE §1).
 * 등급/경고 없음(§2 치환표). +100 이상은 같은 카탈로그 아이템 1제물 예약(BALANCE §1.1).
 * 시간·baseRate는 **등록 시점 스냅샷 영구**(소급 금지, CLAUDE §6.3).
 */
export type EnhanceErrorCode =
  | 'EQUIPMENT_NOT_FOUND'
  | 'EQUIPMENT_LOCKED'
  | 'ALREADY_ENHANCING'
  | 'SLOT_BUSY'
  | 'INSUFFICIENT_FODDER'
  | 'JOB_NOT_FOUND'
  | 'INSUFFICIENT_DIAMOND';

export class EnhanceError extends Error {
  constructor(public code: EnhanceErrorCode) {
    super(code);
    this.name = 'EnhanceError';
  }
}

export type QueueEnhanceInput = { userId: string; equipmentInstanceId: bigint };
export type QueueEnhanceResult = {
  jobId: bigint;
  completeAt: Date;
  durationMs: number;
  fromLevel: number;
  targetLevel: number;
  baseRateBp: number;
  fodderInstanceId: bigint | null;
};

// drizzle 트랜잭션 핸들 타입(내부 공유용 — queue/swap이 같은 tx에서 재사용).
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function isUniqueViolation(e: unknown): boolean {
  if (typeof e !== 'object' || e === null) return false;
  const o = e as { code?: string; message?: string };
  return o.code === '23505' || (o.message?.includes('unique') ?? false);
}

/** 큐 등록 코어 — queue/swap이 동일 tx 내에서 공유. */
export async function queueEnhanceInTx(
  tx: Tx,
  input: QueueEnhanceInput,
): Promise<QueueEnhanceResult> {
  const { userId, equipmentInstanceId } = input;

  const [equip] = await tx
    .select({
      id: equipmentInstances.id,
      catalogItemId: equipmentInstances.catalogItemId,
      enhanceLevel: equipmentInstances.enhanceLevel,
      isLocked: equipmentInstances.isLocked,
      slot: catalogItems.slot,
    })
    .from(equipmentInstances)
    .innerJoin(catalogItems, eq(equipmentInstances.catalogItemId, catalogItems.id))
    .where(and(eq(equipmentInstances.id, equipmentInstanceId), eq(equipmentInstances.userId, userId)))
    .for('update');

  if (!equip) throw new EnhanceError('EQUIPMENT_NOT_FOUND');
  if (equip.isLocked) throw new EnhanceError('EQUIPMENT_LOCKED');

  // 한 개체 = 동시 강화 1건 (equip을 for update로 잠가 직렬화).
  const [dup] = await tx
    .select({ id: enhancementJobs.id })
    .from(enhancementJobs)
    .where(
      and(
        eq(enhancementJobs.equipmentInstanceId, equipmentInstanceId),
        eq(enhancementJobs.status, 'running'),
      ),
    )
    .limit(1);
  if (dup) throw new EnhanceError('ALREADY_ENHANCING');

  const fromLevel = equip.enhanceLevel;
  const targetLevel = fromLevel + 1;
  const slot = equip.slot;

  // 부위당 2 lane — 빈 lane(1|2) 할당, 둘 다 차면 SLOT_BUSY.
  const running = await tx
    .select({ slotLane: enhancementJobs.slotLane })
    .from(enhancementJobs)
    .where(
      and(
        eq(enhancementJobs.userId, userId),
        eq(enhancementJobs.slot, slot),
        eq(enhancementJobs.status, 'running'),
      ),
    );
  const used = new Set(running.map((r) => r.slotLane));
  const slotLane = !used.has(1) ? 1 : !used.has(2) ? 2 : 0;
  if (slotLane === 0) throw new EnhanceError('SLOT_BUSY');

  // +100 이상 — 같은 카탈로그 아이템 1제물 예약 (강화/초월 레벨 무관, 미장착·비잠금·
  // 비강화중, 대상 자신 제외). 예약된 개체는 resolve 시 소모(삭제).
  let fodderInstanceId: bigint | null = null;
  if (fromLevel >= FODDER_REQUIRED_FROM_LEVEL) {
    const [fodder] = await tx
      .select({ id: equipmentInstances.id })
      .from(equipmentInstances)
      .where(
        and(
          eq(equipmentInstances.userId, userId),
          eq(equipmentInstances.catalogItemId, equip.catalogItemId),
          eq(equipmentInstances.isLocked, false),
          sql`${equipmentInstances.id} <> ${equipmentInstanceId}`,
          sql`${equipmentInstances.equippedSlot} is null`,
          sql`not exists (select 1 from ${enhancementJobs} ej
              where ej.equipment_instance_id = ${equipmentInstances.id} and ej.status = 'running')`,
          sql`not exists (select 1 from ${enhancementJobs} ej
              where ej.fodder_instance_id = ${equipmentInstances.id} and ej.status = 'running')`,
        ),
      )
      .limit(1)
      .for('update');
    if (!fodder) throw new EnhanceError('INSUFFICIENT_FODDER');
    fodderInstanceId = fodder.id;
  }

  const durationMs = enhanceDurationMs(fromLevel);
  const baseRateBp = baseSuccessRateBp(fromLevel);
  const completeAt = new Date(Date.now() + durationMs);

  try {
    const [ins] = await tx
      .insert(enhancementJobs)
      .values({
        userId,
        equipmentInstanceId,
        slot,
        slotLane,
        fromLevel,
        targetLevel,
        baseRateBp,
        durationMs: BigInt(durationMs),
        completeAt,
        fodderInstanceId,
        status: 'running',
      })
      .returning({ id: enhancementJobs.id });
    return {
      jobId: ins!.id,
      completeAt,
      durationMs,
      fromLevel,
      targetLevel,
      baseRateBp,
      fodderInstanceId,
    };
  } catch (e) {
    if (isUniqueViolation(e)) throw new EnhanceError('SLOT_BUSY'); // partial unique 최후 방어
    throw e;
  }
}

export function queueEnhance(input: QueueEnhanceInput): Promise<QueueEnhanceResult> {
  return db.transaction((tx) => queueEnhanceInTx(tx, input));
}

// PgTransaction 타입 export 회피용 — 외부는 queueEnhance/queueEnhanceInTx만 사용.
export type { PgTransaction };
