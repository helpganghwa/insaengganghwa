import 'server-only';

import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { walletTrySpend } from '@/lib/game/wallet';
import { userSupplyBoxes } from '@/lib/db/schema/supply';
import { shopPurchases } from '@/lib/db/schema/shop';
import { SUPPLY_SLOTS } from '@/lib/game/balance';

import { boxGrant, productPeriod } from './catalog';
import { periodKey } from './period';

/**
 * 💎로 보급상자 구매(견습의 주머니) — 결제 불필요(인게임 재화 sink). 전 유저.
 * 일일/주간/월간 그 기간 1회 제한 + 💎 차감 + 박스 지급(단일 tx, row 잠금 멱등).
 */
export class BuyBoxError extends Error {
  constructor(public code: 'INSUFFICIENT_DIAMOND' | 'ALREADY_PURCHASED' | 'UNKNOWN_PRODUCT') {
    super(code);
    this.name = 'BuyBoxError';
  }
}

function splitBoxes(n: number): Record<string, number> {
  const base = Math.floor(n / SUPPLY_SLOTS.length);
  const out: Record<string, number> = { weapon: base, armor: base, accessory: base };
  let rem = n - base * SUPPLY_SLOTS.length;
  for (let i = 0; rem > 0; i++, rem--) out[SUPPLY_SLOTS[i % SUPPLY_SLOTS.length]!]! += 1;
  return out;
}

export async function buyBox(
  userId: string,
  serverId: number,
  productId: string,
): Promise<{ cost: number; boxes: number }> {
  const g = boxGrant(productId);
  if (!g) throw new BuyBoxError('UNKNOWN_PRODUCT');
  const period = productPeriod(productId)!; // box는 항상 daily/weekly/monthly
  const cur = periodKey(period);

  await db.transaction(async (tx) => {
    // 1) 주기 1회 제한 — row 잠금 후 비교.
    await tx.insert(shopPurchases).values({ userId, productId, periodKey: '' }).onConflictDoNothing();
    const [row] = await tx
      .select({ periodKey: shopPurchases.periodKey })
      .from(shopPurchases)
      .where(and(eq(shopPurchases.userId, userId), eq(shopPurchases.productId, productId)))
      .for('update');
    if (row?.periodKey === cur) throw new BuyBoxError('ALREADY_PURCHASED');

    // 2) 💎 차감(잔액 충분할 때만 — 조건부 update, 서버별 지갑).
    const paid = await walletTrySpend(tx, userId, serverId, g.cost);
    if (!paid) throw new BuyBoxError('INSUFFICIENT_DIAMOND');

    // 3) 박스 지급(슬롯 분배).
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

    // 4) 주기 기록.
    await tx
      .update(shopPurchases)
      .set({ periodKey: cur, updatedAt: new Date() })
      .where(and(eq(shopPurchases.userId, userId), eq(shopPurchases.productId, productId)));
  });

  return g;
}
