import { getAdminStatus } from '@/lib/auth/require-admin';
import { getActiveServerId } from '@/lib/game/servers';
import { withTimeout } from '@/lib/db/with-timeout';
import { getFreeStatus, FREE_SLOTS, type FreeSlot } from '@/lib/game/shop/free';
import { getPurchaseStatus, getPremiumRemainingDays } from '@/lib/game/shop/dev-purchase';

import { ShopTabs } from './ShopTabs';

/**
 * 상점 — WIREFRAMES §8. 상단 프리미엄 배너 + 탭(일일/주간/월간/충전).
 * 각 탭 최상단 무료 수령(주기 멱등, 결제 불필요). 유료 상품은 결제 연동 전 — 일반 유저는
 * 클릭 시 '준비 중' 토스트, 어드민은 테스트 즉시 구매(결제 단계 없이 바로 지급).
 */
const SHOP_TABS = ['daily', 'weekly', 'monthly', 'charge'] as const;
type ShopTab = (typeof SHOP_TABS)[number];

export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { userId, isAdmin } = await getAdminStatus();
  if (!userId) return null;
  const serverId = await getActiveServerId();

  const tabParam = (await searchParams).tab;
  const initialTab: ShopTab = SHOP_TABS.includes(tabParam as ShopTab)
    ? (tabParam as ShopTab)
    : 'daily';

  const noFree = Object.fromEntries(FREE_SLOTS.map((s) => [s, false])) as Record<FreeSlot, boolean>;
  // 견습의 주머니(💎)는 전 유저 구매 가능 → 구매현황은 모두 로드. 현금/프리미엄은 어드민만 구매.
  const [free, purchased, premiumDays] = await Promise.all([
    withTimeout(getFreeStatus(userId, serverId), 3500, 'shop.free').catch(() => noFree),
    withTimeout(getPurchaseStatus(userId, serverId), 3500, 'shop.purchased').catch(() => [] as string[]),
    withTimeout(getPremiumRemainingDays(userId, serverId), 3500, 'shop.premium').catch(() => null),
  ]);

  return (
    <ShopTabs
      free={free}
      isAdmin={isAdmin}
      purchased={purchased}
      premiumDays={premiumDays}
      initialTab={initialTab}
    />
  );
}
