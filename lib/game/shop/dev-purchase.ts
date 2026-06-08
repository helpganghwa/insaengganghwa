import 'server-only';

import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { profiles } from '@/lib/db/schema/profiles';
import { userSupplyBoxes } from '@/lib/db/schema/supply';
import { shopPurchases } from '@/lib/db/schema/shop';
import { SUPPLY_SLOTS } from '@/lib/game/balance';

import { shopGrant, productPeriod } from './catalog';
import { periodKey } from './period';

/**
 * 어드민 테스트 즉시 구매 — 결제 백엔드(포트원) 연동 전, 현금 상품을 결제 없이 바로 지급.
 * 호출자(action)에서 requireAdmin 가드 필수. 일일/주간/월간 상품은 그 기간 1회만(주기 멱등).
 */
export class ShopBuyError extends Error {
  constructor(public code: 'ALREADY_PURCHASED' | 'UNKNOWN_PRODUCT') {
    super(code);
    this.name = 'ShopBuyError';
  }
}

function splitBoxes(n: number): Record<string, number> {
  const base = Math.floor(n / SUPPLY_SLOTS.length);
  const out: Record<string, number> = { weapon: base, armor: base, accessory: base };
  let rem = n - base * SUPPLY_SLOTS.length;
  for (let i = 0; rem > 0; i++, rem--) out[SUPPLY_SLOTS[i % SUPPLY_SLOTS.length]!]! += 1;
  return out;
}

async function grant(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  userId: string,
  g: { diamond: number; boxes: number },
): Promise<void> {
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
}

export async function devPurchase(
  userId: string,
  productId: string,
): Promise<{ diamond: number; boxes: number }> {
  const g = shopGrant(productId);
  if (!g) throw new ShopBuyError('UNKNOWN_PRODUCT');
  const period = productPeriod(productId);

  await db.transaction(async (tx) => {
    if (!period) {
      // 무제한(다이아 충전) — 기록 없이 지급.
      await grant(tx, userId, g);
      return;
    }
    // 주기 1회 제한 — row 잠금 후 현재 주기와 비교(이미 구매면 차단).
    const cur = periodKey(period);
    await tx.insert(shopPurchases).values({ userId, productId, periodKey: '' }).onConflictDoNothing();
    const [row] = await tx
      .select({ periodKey: shopPurchases.periodKey })
      .from(shopPurchases)
      .where(and(eq(shopPurchases.userId, userId), eq(shopPurchases.productId, productId)))
      .for('update');
    if (row?.periodKey === cur) throw new ShopBuyError('ALREADY_PURCHASED');
    await grant(tx, userId, g);
    await tx
      .update(shopPurchases)
      .set({ periodKey: cur, updatedAt: new Date() })
      .where(and(eq(shopPurchases.userId, userId), eq(shopPurchases.productId, productId)));
  });

  return g;
}

/**
 * 성장 프리미엄 잔여일수 — KST 달력 일수 기준(구매 시각 무관, 자정 지나면 1일 차감).
 * 구매일 = 30, 이후 KST 자정마다 -1, 0 이하면 만료(null). 30일 드립 창.
 */
const kstDay = (ms: number) => new Date(ms + 9 * 3_600_000).toISOString().slice(0, 10);
export async function getPremiumRemainingDays(userId: string): Promise<number | null> {
  const rows = await db
    .select({ updatedAt: shopPurchases.updatedAt })
    .from(shopPurchases)
    .where(and(eq(shopPurchases.userId, userId), eq(shopPurchases.productId, 'premium')));
  const r = rows[0];
  if (!r) return null;
  const buyDay = kstDay(new Date(r.updatedAt).getTime());
  const today = kstDay(Date.now());
  const elapsed = Math.round((Date.parse(today) - Date.parse(buyDay)) / 86_400_000);
  const remaining = 30 - elapsed; // 구매일=30, 자정 경계마다 -1
  return remaining > 0 ? remaining : null;
}

/** 이번 주기에 이미 구매한 상품 id 집합(UI 비활성화용). */
export async function getPurchaseStatus(userId: string): Promise<string[]> {
  const rows = await db
    .select({ productId: shopPurchases.productId, periodKey: shopPurchases.periodKey })
    .from(shopPurchases)
    .where(eq(shopPurchases.userId, userId));
  const out: string[] = [];
  for (const r of rows) {
    const p = productPeriod(r.productId);
    if (p && r.periodKey === periodKey(p)) out.push(r.productId);
  }
  return out;
}
