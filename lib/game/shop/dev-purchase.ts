import 'server-only';

/**
 * 상점 조회 헬퍼 — 구매 현황·프리미엄 잔여일수·첫 결제 특가 여부.
 * ⚠ 어드민 테스트 즉시구매(devPurchase)는 폐지했다(2026-07-29) — 어드민도 본인인증·실결제를
 * 거쳐야 출시 전에 실제 흐름의 문제를 발견할 수 있다. 지급 경로는 실결제(payment) 하나뿐이다.
 */

import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { iapOrders } from '@/lib/db/schema/payment';
import { shopPurchases } from '@/lib/db/schema/shop';

import { FIRST_SPECIAL, PREMIUM, productPeriod } from './catalog';
import { periodKey } from './period';


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
    // 성장 프리미엄은 달력월이 아니라 **드립 잔여일(getPremiumRemainingDays)** 로만 판정한다 —
    // 서버 차단(purchase.ts)·카드 표시("N일 남음")가 그 기준인데 여기서 monthly periodKey로
    // 집합에 넣으면 1일 구매 → 31일 만료처럼 같은 달 안에 끝나는 경우 UI(tapPaid)가
    // "이미 구매완료"로 재구매를 막아 서버와 어긋난다(2026-08-26 점검).
    if (r.productId === PREMIUM.id) continue;
    const p = productPeriod(r.productId);
    if (p && r.periodKey === periodKey(p)) out.push(r.productId);
  }
  return out;
}

/**
 * 인생 특가(서버별 1회) 구매 여부 — 캐러셀 슬라이드 숨김·재구매 차단 판단.
 * 실결제(iap_orders paid)와 어드민 테스트 지급(shop_purchases 'once') 모두 인정.
 */
export async function hasFirstSpecial(userId: string, serverId: number): Promise<boolean> {
  const [[paid], [dev]] = await Promise.all([
    db
      .select({ id: iapOrders.id })
      .from(iapOrders)
      .where(
        and(
          eq(iapOrders.userId, userId),
          eq(iapOrders.serverId, serverId),
          eq(iapOrders.productCode, FIRST_SPECIAL.id),
          eq(iapOrders.status, 'paid'),
        ),
      )
      .limit(1),
    db
      .select({ userId: shopPurchases.userId })
      .from(shopPurchases)
      .where(
        and(
          eq(shopPurchases.userId, userId),
          eq(shopPurchases.serverId, serverId),
          eq(shopPurchases.productId, FIRST_SPECIAL.id),
          eq(shopPurchases.periodKey, 'once'),
        ),
      )
      .limit(1),
  ]);
  return !!(paid || dev);
}
