import 'server-only';

import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { catalogItems, userEquipment } from '@/lib/db/schema/equipment';

/** 장착 — SCHEMA §2.2. 슬롯당 1개(부분 UNIQUE): 같은 슬롯 기존 장착은 해제 후 교체. */
export class EquipError extends Error {
  constructor(public code: 'NOT_FOUND') {
    super(code);
    this.name = 'EquipError';
  }
}

export function equipItem(userId: string, userEquipmentId: bigint): Promise<void> {
  return db.transaction(async (tx) => {
    const [equip] = await tx
      .select({ id: userEquipment.id, slot: catalogItems.slot })
      .from(userEquipment)
      .innerJoin(catalogItems, eq(userEquipment.catalogItemId, catalogItems.id))
      .where(and(eq(userEquipment.id, userEquipmentId), eq(userEquipment.userId, userId)))
      .for('update');
    if (!equip) throw new EquipError('NOT_FOUND');

    // 같은 슬롯 기존 장착 해제(부분 UNIQUE 충돌 방지) → 대상 장착, 단일 tx.
    await tx
      .update(userEquipment)
      .set({ equippedSlot: null })
      .where(and(eq(userEquipment.userId, userId), eq(userEquipment.equippedSlot, equip.slot)));
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
