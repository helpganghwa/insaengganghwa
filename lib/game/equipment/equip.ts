import 'server-only';

import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { catalogItems, userEquipment } from '@/lib/db/schema/equipment';

/** 장착 — SCHEMA §2.2. 슬롯당 1개(부분 UNIQUE): 같은 슬롯 기존 장착은 해제 후 교체. */
export class EquipError extends Error {
  constructor(public code: 'NOT_FOUND' | 'SLOT_TAKEN') {
    super(code);
    this.name = 'EquipError';
  }
}

/** Postgres unique_violation(23505) 판별 — 슬롯 UNIQUE(ue_user_slot_uq) 동시 장착 최후 방어. */
function isUniqueViolation(e: unknown): boolean {
  return typeof e === 'object' && e !== null && 'code' in e && (e as { code?: string }).code === '23505';
}

export async function equipItem(userId: string, userEquipmentId: bigint): Promise<void> {
  try {
    await equipItemTx(userId, userEquipmentId);
  } catch (e) {
    // 동시 장착 레이스 — 다른 요청이 같은 슬롯을 먼저 점유(부분 UNIQUE 충돌). 재시도 여지 안내.
    if (isUniqueViolation(e)) throw new EquipError('SLOT_TAKEN');
    throw e;
  }
}

function equipItemTx(userId: string, userEquipmentId: bigint): Promise<void> {
  return db.transaction(async (tx) => {
    const [equip] = await tx
      .select({ id: userEquipment.id, serverId: userEquipment.serverId, slot: catalogItems.slot })
      .from(userEquipment)
      .innerJoin(catalogItems, eq(userEquipment.catalogItemId, catalogItems.id))
      .where(and(eq(userEquipment.id, userEquipmentId), eq(userEquipment.userId, userId)))
      .for('update');
    if (!equip) throw new EquipError('NOT_FOUND');

    // 같은 슬롯 기존 장착 해제(부분 UNIQUE 충돌 방지) → 대상 장착, 단일 tx.
    await tx
      .update(userEquipment)
      .set({ equippedSlot: null })
      .where(
        and(
          eq(userEquipment.userId, userId),
          eq(userEquipment.serverId, equip.serverId),
          eq(userEquipment.equippedSlot, equip.slot),
        ),
      );
    await tx
      .update(userEquipment)
      .set({ equippedSlot: equip.slot })
      .where(eq(userEquipment.id, userEquipmentId));
  });
}

export async function unequipItem(userId: string, userEquipmentId: bigint): Promise<void> {
  await db
    .update(userEquipment)
    .set({ equippedSlot: null })
    .where(and(eq(userEquipment.id, userEquipmentId), eq(userEquipment.userId, userId)));
}
