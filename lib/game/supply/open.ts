import 'server-only';

import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { catalogItems, equipmentInstances, userCodex, type Slot } from '@/lib/db/schema/equipment';
import { userSupplyBoxes, supplyOpenLogs } from '@/lib/db/schema/supply';

/**
 * 보급 상자 열기 — GDD §3.4 / BALANCE §4 / SCHEMA §5.
 * 슬롯 일치 박스 → 해당 슬롯 활성 카탈로그 **균등 랜덤** 1개(+0·초월0) 획득.
 * 천장 없음. 중복=별도 개체(초월/+100 제물).
 * count 차감 + 개체 생성 + 도감 + 로그 = 단일 트랜잭션.
 */
export type SupplyErrorCode = 'NO_BOX' | 'NO_CATALOG';
export class SupplyError extends Error {
  constructor(public code: SupplyErrorCode) {
    super(code);
    this.name = 'SupplyError';
  }
}

export type OpenResult = {
  equipmentInstanceId: bigint;
  catalogItemId: number;
  isNew: boolean;
};

function rngU32(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]!;
}

export function openSupplyBoxes(input: {
  userId: string;
  slot: Slot;
  count?: number;
}): Promise<OpenResult[]> {
  const { userId, slot } = input;
  const n = Math.max(1, Math.floor(input.count ?? 1));

  return db.transaction(async (tx) => {
    const [box] = await tx
      .select({ count: userSupplyBoxes.count })
      .from(userSupplyBoxes)
      .where(and(eq(userSupplyBoxes.userId, userId), eq(userSupplyBoxes.slot, slot)))
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

      const [inst] = await tx
        .insert(equipmentInstances)
        .values({ userId, catalogItemId, enhanceLevel: 0, transcendLevel: 0 })
        .returning({ id: equipmentInstances.id });

      // 도감 신규 해금 여부 — 최초 획득이면 row 생성.
      const [codexRow] = await tx
        .select({ uid: userCodex.userId })
        .from(userCodex)
        .where(and(eq(userCodex.userId, userId), eq(userCodex.catalogItemId, catalogItemId)))
        .limit(1);
      const isNew = !codexRow;
      if (isNew) {
        await tx
          .insert(userCodex)
          .values({ userId, catalogItemId, maxEnhanceLevel: 0 })
          .onConflictDoNothing();
      }

      await tx.insert(supplyOpenLogs).values({
        userId,
        slot,
        catalogItemId,
        isNew,
      });

      results.push({ equipmentInstanceId: inst!.id, catalogItemId, isNew });
    }

    await tx
      .update(userSupplyBoxes)
      .set({ count: sql`${userSupplyBoxes.count} - ${BigInt(n)}` })
      .where(and(eq(userSupplyBoxes.userId, userId), eq(userSupplyBoxes.slot, slot)));

    return results;
  });
}
