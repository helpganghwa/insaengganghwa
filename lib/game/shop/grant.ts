import 'server-only';

import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { walletAdd } from '@/lib/game/wallet';
import { userSupplyBoxes } from '@/lib/db/schema/supply';
import { shopPurchases } from '@/lib/db/schema/shop';
import { mailbox } from '@/lib/db/schema/mailbox';
import { SUPPLY_SLOTS } from '@/lib/game/balance';

import { shopGrant, productPeriod, PREMIUM } from './catalog';
import { periodKey } from './period';

/**
 * 상점 지급 — dev 테스트 즉시구매(dev-purchase)와 실결제(payment) **공용 단일 진실 원천**.
 * 지급 수치·분배·우편 형식이 두 경로에서 어긋나면 결제 정합성이 깨지므로 여기서만 정의.
 */
export type Grant = { diamond: number; boxes: number };

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** 보급 상자 n개를 슬롯(무기/방어구/장신구) 균등 분배 — 나머지는 슬롯 순서대로 1개씩. */
export function splitBoxes(n: number): Record<string, number> {
  const base = Math.floor(n / SUPPLY_SLOTS.length);
  const out: Record<string, number> = { weapon: base, armor: base, accessory: base };
  let rem = n - base * SUPPLY_SLOTS.length;
  for (let i = 0; rem > 0; i++, rem--) out[SUPPLY_SLOTS[i % SUPPLY_SLOTS.length]!]! += 1;
  return out;
}

/** 다이아 → 지갑 가산, 상자 → 슬롯별 보유량 가산. 즉시 반영(비-우편). */
export async function creditGrant(tx: Tx, userId: string, serverId: number, g: Grant): Promise<void> {
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

/** 성장 프리미엄 즉시 보상을 우편으로 적재(다이아 + 균등 분배 상자). 수령 시 claimMail이 지갑/상자 가산. */
export async function mailPremiumInstant(
  tx: Tx,
  userId: string,
  serverId: number,
  g: Grant,
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

/**
 * 상품 지급 본체(지급 + 주기 마킹) — **결제 검증/주기 사전체크 이후** 호출하는 무조건 지급.
 * 결제가 이미 성사된 시점이라 여기서 차단하지 않는다(미지급 방지). 주기 상품은 periodKey를 현재로 갱신
 * (일일/주간/월간 1회 추적 — UI 비활성화·드립 기준). 프리미엄은 즉시분 우편(일일분은 로그인 드립 별도).
 */
export async function applyProductGrant(
  tx: Tx,
  userId: string,
  serverId: number,
  productId: string,
): Promise<Grant> {
  const g = shopGrant(productId);
  if (!g) throw new Error('UNKNOWN_PRODUCT');
  const period = productPeriod(productId);

  if (productId === PREMIUM.id) {
    await mailPremiumInstant(tx, userId, serverId, g, {
      title: '성장 프리미엄 — 즉시 보상',
      body: '성장 프리미엄 구매 감사합니다. 즉시 보상이 도착했어요. 매일 보상도 우편으로 찾아갑니다.',
    });
  } else {
    await creditGrant(tx, userId, serverId, g);
  }

  if (period) {
    const cur = periodKey(period);
    await tx
      .insert(shopPurchases)
      .values({ userId, serverId, productId, periodKey: cur })
      .onConflictDoUpdate({
        target: [shopPurchases.userId, shopPurchases.serverId, shopPurchases.productId],
        set: { periodKey: cur, updatedAt: new Date() },
      });
  }

  return g;
}
