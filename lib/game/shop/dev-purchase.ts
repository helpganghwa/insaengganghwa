import 'server-only';

import { eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { profiles } from '@/lib/db/schema/profiles';
import { userSupplyBoxes } from '@/lib/db/schema/supply';
import { SUPPLY_SLOTS } from '@/lib/game/balance';

import { shopGrant } from './catalog';

/**
 * 어드민 테스트 즉시 구매 — 결제 백엔드(포트원) 연동 전, 현금 상품을 결제 없이 바로 지급.
 * 호출자(action)에서 requireAdmin 가드 필수. 실제 결제 흐름과 별개(테스트 전용).
 */
function splitBoxes(n: number): Record<string, number> {
  const base = Math.floor(n / SUPPLY_SLOTS.length);
  const out: Record<string, number> = { weapon: base, armor: base, accessory: base };
  let rem = n - base * SUPPLY_SLOTS.length;
  for (let i = 0; rem > 0; i++, rem--) out[SUPPLY_SLOTS[i % SUPPLY_SLOTS.length]!]! += 1;
  return out;
}

export async function devPurchase(
  userId: string,
  productId: string,
): Promise<{ diamond: number; boxes: number }> {
  const g = shopGrant(productId);
  if (!g) throw new Error('UNKNOWN_PRODUCT');
  await db.transaction(async (tx) => {
    if (g.diamond > 0) {
      await tx
        .update(profiles)
        .set({ diamond: sql`${profiles.diamond} + ${BigInt(g.diamond)}` })
        .where(eq(profiles.id, userId));
    }
    if (g.boxes > 0) {
      const dist = splitBoxes(g.boxes);
      for (const slot of SUPPLY_SLOTS) {
        const n = dist[slot] ?? 0;
        if (n > 0) {
          await tx
            .insert(userSupplyBoxes)
            .values({ userId, slot, count: BigInt(n) })
            .onConflictDoUpdate({
              target: [userSupplyBoxes.userId, userSupplyBoxes.slot],
              set: { count: sql`${userSupplyBoxes.count} + ${BigInt(n)}` },
            });
        }
      }
    }
  });
  return g;
}
