import 'server-only';

import { and, eq, isNotNull } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { catalogItems, userEquipment, type Slot } from '@/lib/db/schema/equipment';
import { pieceCombatPower } from '@/lib/game/balance';

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

/** 최적조합 — 슬롯별 전투력 최고 장비 장착(BALANCE §3). */
export function equipBestSet(userId: string): Promise<{ slotsUpdated: number }> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({
        id: userEquipment.id,
        slot: catalogItems.slot,
        enhanceLevel: userEquipment.enhanceLevel,
        transcendLevel: userEquipment.transcendLevel,
      })
      .from(userEquipment)
      .innerJoin(catalogItems, eq(userEquipment.catalogItemId, catalogItems.id))
      .where(eq(userEquipment.userId, userId));

    const best = new Map<Slot, { id: bigint; cp: number }>();
    for (const r of rows) {
      const cp = pieceCombatPower(r.enhanceLevel, r.transcendLevel);
      const cur = best.get(r.slot);
      if (!cur || cp > cur.cp) best.set(r.slot, { id: r.id, cp });
    }
    if (best.size === 0) return { slotsUpdated: 0 };

    // 대상 외 장착 전부 해제 후 베스트 장착.
    await tx
      .update(userEquipment)
      .set({ equippedSlot: null })
      .where(and(eq(userEquipment.userId, userId), isNotNull(userEquipment.equippedSlot)));
    for (const [slot, b] of best) {
      await tx.update(userEquipment).set({ equippedSlot: slot }).where(eq(userEquipment.id, b.id));
    }
    return { slotsUpdated: best.size };
  });
}
