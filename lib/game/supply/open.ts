import 'server-only';

import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { profiles } from '@/lib/db/schema/profiles';
import { catalogItems, equipmentInstances, userCodex, type Slot } from '@/lib/db/schema/equipment';
import { userSupplyBoxes, supplyOpenLogs } from '@/lib/db/schema/supply';
import {
  GEM_DROP_MAX,
  GEM_DROP_MIN,
  GEM_DROP_ON_OPEN_RATE_BP,
} from '@/lib/game/balance';

/**
 * 보급 상자 개봉 — GDD §3.4 / BALANCE §4 / SCHEMA §5.
 * 슬롯 일치 박스 → 해당 슬롯 활성 카탈로그 **균등 랜덤** 1개(+0·초월0) 획득.
 * 천장 없음. 개봉마다 20% 확률 보석 1~3 추가. 중복=별도 개체(초월/+100 제물).
 * count 차감 + 개체 생성 + 보석 + 도감 + 로그 = 단일 트랜잭션.
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
  gemDrop: number;
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
    let gemTotal = 0;

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

      // 보석 드롭 — 20% 확률, 1~3 (BALANCE §4.3).
      let gemDrop = 0;
      if (rngU32() % 10000 < GEM_DROP_ON_OPEN_RATE_BP) {
        gemDrop = GEM_DROP_MIN + (rngU32() % (GEM_DROP_MAX - GEM_DROP_MIN + 1));
        gemTotal += gemDrop;
      }

      await tx.insert(supplyOpenLogs).values({
        userId,
        slot,
        catalogItemId,
        isNew,
        gemDrop,
      });

      results.push({ equipmentInstanceId: inst!.id, catalogItemId, isNew, gemDrop });
    }

    await tx
      .update(userSupplyBoxes)
      .set({ count: sql`${userSupplyBoxes.count} - ${BigInt(n)}` })
      .where(and(eq(userSupplyBoxes.userId, userId), eq(userSupplyBoxes.slot, slot)));

    if (gemTotal > 0) {
      await tx
        .update(profiles)
        .set({ diamond: sql`${profiles.diamond} + ${BigInt(gemTotal)}` })
        .where(eq(profiles.id, userId));
    }

    return results;
  });
}
