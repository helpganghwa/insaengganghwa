import 'server-only';

import { and, eq, isNotNull } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { isUniqueViolation } from '@/lib/db/errors';
import { catalogItems, equipmentChangeLogs, userEquipment } from '@/lib/db/schema/equipment';

/** 장착 — SCHEMA §2.2. 슬롯당 1개(부분 UNIQUE): 같은 슬롯 기존 장착은 해제 후 교체. */
export class EquipError extends Error {
  constructor(public code: 'NOT_FOUND' | 'SLOT_TAKEN') {
    super(code);
    this.name = 'EquipError';
  }
}

export async function equipItem(userId: string, userEquipmentId: bigint): Promise<void> {
  try {
    await equipItemTx(userId, userEquipmentId);
  } catch (e) {
    // 동시 장착 레이스 — 다른 요청이 같은 슬롯을 먼저 점유(부분 UNIQUE ue_user_slot_uq 충돌). 재시도 여지 안내.
    if (isUniqueViolation(e)) throw new EquipError('SLOT_TAKEN');
    throw e;
  }
}

/**
 * 여러 장비를 한 트랜잭션으로 장착(무한의 탑 자동 장착) — 부위마다 equipItem과 같은 처리, 요청·재렌더 1번.
 * 같은 부위가 두 번 오면 뒤의 것이 이긴다(앞 것을 해제하고 교체).
 */
export async function equipItems(userId: string, userEquipmentIds: bigint[], serverId?: number): Promise<void> {
  if (!userEquipmentIds.length) return;
  try {
    await db.transaction(async (tx) => {
      for (const id of userEquipmentIds) await equipInTx(tx, userId, id, serverId);
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new EquipError('SLOT_TAKEN');
    throw e;
  }
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function equipItemTx(userId: string, userEquipmentId: bigint): Promise<void> {
  return db.transaction((tx) => equipInTx(tx, userId, userEquipmentId));
}

/** serverId를 주면 그 서버 장비만(아니면 NOT_FOUND) — 무한의 탑처럼 지금 서버 장비만 다루는 곳. */
async function equipInTx(tx: Tx, userId: string, userEquipmentId: bigint, serverId?: number): Promise<void> {
  const [equip] = await tx
    .select({
      id: userEquipment.id,
      serverId: userEquipment.serverId,
      catalogItemId: userEquipment.catalogItemId,
      slot: catalogItems.slot,
    })
    .from(userEquipment)
    .innerJoin(catalogItems, eq(userEquipment.catalogItemId, catalogItems.id))
    .where(and(eq(userEquipment.id, userEquipmentId), eq(userEquipment.userId, userId)))
    .for('update');
  if (!equip || (serverId != null && equip.serverId !== serverId)) throw new EquipError('NOT_FOUND');

  // 같은 슬롯 기존 장착 해제(부분 UNIQUE 충돌 방지) → 대상 장착, 단일 tx.
  const prev = await tx
    .update(userEquipment)
    .set({ equippedSlot: null })
    .where(
      and(
        eq(userEquipment.userId, userId),
        eq(userEquipment.serverId, equip.serverId),
        eq(userEquipment.equippedSlot, equip.slot),
      ),
    )
    .returning({ catalogItemId: userEquipment.catalogItemId });
  await tx
    .update(userEquipment)
    .set({ equippedSlot: equip.slot })
    .where(eq(userEquipment.id, userEquipmentId));
  // 이력(0176) — 같은 장비 재장착(prev==대상)은 변화가 없으므로 남기지 않는다.
  const fromId = prev[0]?.catalogItemId ?? null;
  if (fromId !== equip.catalogItemId) {
    await tx.insert(equipmentChangeLogs).values({
      userId,
      serverId: equip.serverId,
      slot: equip.slot,
      fromCatalogItemId: fromId,
      toCatalogItemId: equip.catalogItemId,
    });
  }
}

export async function unequipItem(userId: string, userEquipmentId: bigint): Promise<void> {
  await db.transaction(async (tx) => {
    const [prev] = await tx
      .update(userEquipment)
      .set({ equippedSlot: null })
      .where(
        and(
          eq(userEquipment.id, userEquipmentId),
          eq(userEquipment.userId, userId),
          isNotNull(userEquipment.equippedSlot),
        ),
      )
      .returning({
        serverId: userEquipment.serverId,
        catalogItemId: userEquipment.catalogItemId,
      });
    if (!prev) return; // 이미 미장착 — 변화 없음
    const [cat] = await tx
      .select({ slot: catalogItems.slot })
      .from(catalogItems)
      .where(eq(catalogItems.id, prev.catalogItemId));
    if (!cat) return;
    await tx.insert(equipmentChangeLogs).values({
      userId,
      serverId: prev.serverId,
      slot: cat.slot,
      fromCatalogItemId: prev.catalogItemId,
      toCatalogItemId: null,
    });
  });
}
