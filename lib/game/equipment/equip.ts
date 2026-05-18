import 'server-only';

import { and, eq, inArray, isNotNull } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { catalogItems, equipmentInstances, type Slot } from '@/lib/db/schema/equipment';
import { pieceCombatPower } from '@/lib/game/balance';

/** 장착/잠금 — SCHEMA §2.2. 슬롯당 1개(부분 UNIQUE): 같은 슬롯 기존 장착은 해제 후 교체. */
export class EquipError extends Error {
  constructor(public code: 'NOT_FOUND') {
    super(code);
    this.name = 'EquipError';
  }
}

export function equipItem(userId: string, equipmentInstanceId: bigint): Promise<void> {
  return db.transaction(async (tx) => {
    const [inst] = await tx
      .select({ id: equipmentInstances.id, slot: catalogItems.slot })
      .from(equipmentInstances)
      .innerJoin(catalogItems, eq(equipmentInstances.catalogItemId, catalogItems.id))
      .where(
        and(eq(equipmentInstances.id, equipmentInstanceId), eq(equipmentInstances.userId, userId)),
      )
      .for('update');
    if (!inst) throw new EquipError('NOT_FOUND');

    // 같은 슬롯 기존 장착 해제(부분 UNIQUE 충돌 방지) → 대상 장착, 단일 tx.
    await tx
      .update(equipmentInstances)
      .set({ equippedSlot: null })
      .where(
        and(eq(equipmentInstances.userId, userId), eq(equipmentInstances.equippedSlot, inst.slot)),
      );
    await tx
      .update(equipmentInstances)
      .set({ equippedSlot: inst.slot })
      .where(eq(equipmentInstances.id, equipmentInstanceId));
  });
}

export async function unequipItem(userId: string, equipmentInstanceId: bigint): Promise<void> {
  await db
    .update(equipmentInstances)
    .set({ equippedSlot: null })
    .where(
      and(eq(equipmentInstances.id, equipmentInstanceId), eq(equipmentInstances.userId, userId)),
    );
}

export function toggleEquipmentLock(
  userId: string,
  equipmentInstanceId: bigint,
): Promise<{ isLocked: boolean }> {
  return db.transaction(async (tx) => {
    const [inst] = await tx
      .select({ isLocked: equipmentInstances.isLocked })
      .from(equipmentInstances)
      .where(
        and(eq(equipmentInstances.id, equipmentInstanceId), eq(equipmentInstances.userId, userId)),
      )
      .for('update');
    if (!inst) throw new EquipError('NOT_FOUND');
    const next = !inst.isLocked;
    await tx
      .update(equipmentInstances)
      .set({ isLocked: next })
      .where(eq(equipmentInstances.id, equipmentInstanceId));
    return { isLocked: next };
  });
}

/** 최적조합 — 슬롯별 전투력 최고 개체 장착(BALANCE §3). */
export function equipBestSet(userId: string): Promise<{ slotsUpdated: number }> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({
        id: equipmentInstances.id,
        slot: catalogItems.slot,
        enhanceLevel: equipmentInstances.enhanceLevel,
        transcendLevel: equipmentInstances.transcendLevel,
      })
      .from(equipmentInstances)
      .innerJoin(catalogItems, eq(equipmentInstances.catalogItemId, catalogItems.id))
      .where(eq(equipmentInstances.userId, userId));

    const best = new Map<Slot, { id: bigint; cp: number }>();
    for (const r of rows) {
      const cp = pieceCombatPower(r.enhanceLevel, r.transcendLevel);
      const cur = best.get(r.slot);
      if (!cur || cp > cur.cp) best.set(r.slot, { id: r.id, cp });
    }
    const targetIds = [...best.values()].map((b) => b.id);
    if (targetIds.length === 0) return { slotsUpdated: 0 };

    // 대상 외 장착 전부 해제 후 베스트 장착 (slot=catalog로 재설정).
    await tx
      .update(equipmentInstances)
      .set({ equippedSlot: null })
      .where(and(eq(equipmentInstances.userId, userId), isNotNull(equipmentInstances.equippedSlot)));
    for (const [slot, b] of best) {
      await tx
        .update(equipmentInstances)
        .set({ equippedSlot: slot })
        .where(inArray(equipmentInstances.id, [b.id]));
    }
    return { slotsUpdated: best.size };
  });
}
