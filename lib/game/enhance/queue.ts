import 'server-only';

import { and, eq } from 'drizzle-orm';
import type { PgTransaction } from 'drizzle-orm/pg-core';

import { db } from '@/lib/db/client';
import { catalogItems, userEquipment } from '@/lib/db/schema/equipment';
import { enhancementJobs } from '@/lib/db/schema/enhance';
import { baseSuccessRateBp, enhanceDurationMs } from '@/lib/game/balance';

/**
 * (A) 강화 큐 등록 — CLAUDE §6.1. **강화 시도는 무료**(자원·제물 비용 없음, BALANCE §1).
 * 시간·baseRate는 **등록 시점 스냅샷 영구**(소급 금지, CLAUDE §6.3). 대상은 user_equipment 레코드.
 */
export type EnhanceErrorCode =
  | 'EQUIPMENT_NOT_FOUND'
  | 'ALREADY_ENHANCING'
  | 'SLOT_BUSY'
  | 'JOB_NOT_FOUND'
  | 'INSUFFICIENT_DIAMOND';

export class EnhanceError extends Error {
  constructor(public code: EnhanceErrorCode) {
    super(code);
    this.name = 'EnhanceError';
  }
}

export type QueueEnhanceInput = { userId: string; userEquipmentId: bigint };
export type QueueEnhanceResult = {
  jobId: bigint;
  completeAt: Date;
  durationMs: number;
  fromLevel: number;
  targetLevel: number;
  baseRateBp: number;
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
  const { userId, userEquipmentId } = input;

  const [equip] = await tx
    .select({
      id: userEquipment.id,
      serverId: userEquipment.serverId,
      catalogItemId: userEquipment.catalogItemId,
      enhanceLevel: userEquipment.enhanceLevel,
      slot: catalogItems.slot,
    })
    .from(userEquipment)
    .innerJoin(catalogItems, eq(userEquipment.catalogItemId, catalogItems.id))
    .where(and(eq(userEquipment.id, userEquipmentId), eq(userEquipment.userId, userId)))
    .for('update');

  if (!equip) throw new EnhanceError('EQUIPMENT_NOT_FOUND');

  // 한 장비 = 동시 강화 1건 (equip을 for update로 잠가 직렬화).
  const [dup] = await tx
    .select({ id: enhancementJobs.id })
    .from(enhancementJobs)
    .where(
      and(
        eq(enhancementJobs.userEquipmentId, userEquipmentId),
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
        eq(enhancementJobs.serverId, equip.serverId),
        eq(enhancementJobs.slot, slot),
        eq(enhancementJobs.status, 'running'),
      ),
    );
  const used = new Set(running.map((r) => r.slotLane));
  const slotLane = !used.has(1) ? 1 : !used.has(2) ? 2 : 0;
  if (slotLane === 0) throw new EnhanceError('SLOT_BUSY');

  const durationMs = enhanceDurationMs(fromLevel);
  const baseRateBp = baseSuccessRateBp(fromLevel);
  const completeAt = new Date(Date.now() + durationMs);

  try {
    const [ins] = await tx
      .insert(enhancementJobs)
      .values({
        userId,
        serverId: equip.serverId,
        userEquipmentId,
        slot,
        slotLane,
        fromLevel,
        targetLevel,
        baseRateBp,
        durationMs: BigInt(durationMs),
        completeAt,
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
