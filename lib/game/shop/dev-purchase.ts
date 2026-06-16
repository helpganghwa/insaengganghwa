import 'server-only';

import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { walletAdd } from '@/lib/game/wallet';
import { userSupplyBoxes } from '@/lib/db/schema/supply';
import { shopPurchases } from '@/lib/db/schema/shop';
import { mailbox } from '@/lib/db/schema/mailbox';
import { SUPPLY_SLOTS } from '@/lib/game/balance';

import { shopGrant, productPeriod, PREMIUM } from './catalog';
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

/** 보상을 우편으로 적재(다이아 + 슬롯 균등 분배 상자). 수령 시 claimMail이 지갑/상자 가산. */
async function mailReward(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  userId: string,
  serverId: number,
  g: { diamond: number; boxes: number },
  meta: { title: string; body: string },
): Promise<void> {
  const dist = splitBoxes(g.boxes);
  await tx.insert(mailbox).values({
    userId,
    serverId,
    type: 'reward',
    title: meta.title,
    body: meta.body,
    senderLabel: '성장 프리미엄',
    payload: {
      diamond: g.diamond,
      boxes: { weapon: dist.weapon ?? 0, armor: dist.armor ?? 0, accessory: dist.accessory ?? 0 },
    },
  });
}

async function grant(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  userId: string,
  serverId: number,
  g: { diamond: number; boxes: number },
): Promise<void> {
  if (g.diamond > 0) {
    await walletAdd(tx, userId, serverId, g.diamond);
  }
  if (g.boxes > 0) {
    const dist = splitBoxes(g.boxes);
    for (const slot of SUPPLY_SLOTS) {
      const n = dist[slot] ?? 0;
      if (n > 0) {
        await tx
          .insert(userSupplyBoxes)
          .values({ userId, serverId, slot, count: BigInt(n) })
          .onConflictDoUpdate({
            target: [userSupplyBoxes.userId, userSupplyBoxes.serverId, userSupplyBoxes.slot],
            set: { count: sql`${userSupplyBoxes.count} + ${BigInt(n)}` },
          });
      }
    }
  }
}

export async function devPurchase(
  userId: string,
  serverId: number,
  productId: string,
): Promise<{ diamond: number; boxes: number }> {
  const g = shopGrant(productId);
  if (!g) throw new ShopBuyError('UNKNOWN_PRODUCT');
  const period = productPeriod(productId);

  await db.transaction(async (tx) => {
    if (!period) {
      // 무제한(다이아 충전) — 기록 없이 지급.
      await grant(tx, userId, serverId, g);
      return;
    }
    // 주기 1회 제한 — row 잠금 후 현재 주기와 비교(이미 구매면 차단).
    const cur = periodKey(period);
    await tx
      .insert(shopPurchases)
      .values({ userId, serverId, productId, periodKey: '' })
      .onConflictDoNothing();
    const [row] = await tx
      .select({ periodKey: shopPurchases.periodKey })
      .from(shopPurchases)
      .where(
        and(
          eq(shopPurchases.userId, userId),
          eq(shopPurchases.serverId, serverId),
          eq(shopPurchases.productId, productId),
        ),
      )
      .for('update');
    if (row?.periodKey === cur) throw new ShopBuyError('ALREADY_PURCHASED');
    if (productId === PREMIUM.id) {
      // 성장 프리미엄 — 즉시 지급분을 우편으로(일일분은 로그인 드립 ensurePremiumDailyMail).
      await mailReward(tx, userId, serverId, g, {
        title: '성장 프리미엄 — 즉시 보상',
        body: '성장 프리미엄 구매 감사합니다. 즉시 보상이 도착했어요. 매일 보상도 우편으로 찾아갑니다.',
      });
    } else {
      await grant(tx, userId, serverId, g);
    }
    await tx
      .update(shopPurchases)
      .set({ periodKey: cur, updatedAt: new Date() })
      .where(
        and(
          eq(shopPurchases.userId, userId),
          eq(shopPurchases.serverId, serverId),
          eq(shopPurchases.productId, productId),
        ),
      );
  });

  return g;
}

/**
 * 성장 프리미엄 잔여일수 — KST 달력 일수 기준(구매 시각 무관, 자정 지나면 1일 차감).
 * 구매일 = 30, 이후 KST 자정마다 -1, 0 이하면 만료(null). 30일 드립 창.
 */
const kstDay = (ms: number) => new Date(ms + 9 * 3_600_000).toISOString().slice(0, 10);
export async function getPremiumRemainingDays(userId: string, serverId: number): Promise<number | null> {
  const rows = await db
    .select({ updatedAt: shopPurchases.updatedAt })
    .from(shopPurchases)
    .where(
      and(
        eq(shopPurchases.userId, userId),
        eq(shopPurchases.serverId, serverId),
        eq(shopPurchases.productId, 'premium'),
      ),
    );
  const r = rows[0];
  if (!r) return null;
  const buyDay = kstDay(new Date(r.updatedAt).getTime());
  const today = kstDay(Date.now());
  const elapsed = Math.round((Date.parse(today) - Date.parse(buyDay)) / 86_400_000);
  const remaining = 30 - elapsed; // 구매일=30, 자정 경계마다 -1
  return remaining > 0 ? remaining : null;
}

/** 이번 주기에 이미 구매한 상품 id 집합(UI 비활성화용). */
export async function getPurchaseStatus(userId: string, serverId: number): Promise<string[]> {
  const rows = await db
    .select({ productId: shopPurchases.productId, periodKey: shopPurchases.periodKey })
    .from(shopPurchases)
    .where(and(eq(shopPurchases.userId, userId), eq(shopPurchases.serverId, serverId)));
  const out: string[] = [];
  for (const r of rows) {
    const p = productPeriod(r.productId);
    if (p && r.periodKey === periodKey(p)) out.push(r.productId);
  }
  return out;
}
