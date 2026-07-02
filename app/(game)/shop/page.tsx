import { getAdminStatus } from '@/lib/auth/require-admin';
import { shouldHidePaidContent } from '@/lib/auth/session';
import { getActiveServerId } from '@/lib/game/servers';
import { withTimeout } from '@/lib/db/with-timeout';
import { getFreeStatus, FREE_SLOTS, type FreeSlot } from '@/lib/game/shop/free';
import { getPurchaseStatus, getPremiumRemainingDays } from '@/lib/game/shop/dev-purchase';
import { portoneConfig } from '@/lib/payment/purchase';

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
  searchParams: Promise<{ tab?: string; paymentId?: string; code?: string }>;
}) {
  const { userId, isAdmin } = await getAdminStatus();
  if (!userId) return null;
  const serverId = await getActiveServerId();

  const sp = await searchParams;
  const tabParam = sp.tab;
  const initialTab: ShopTab = SHOP_TABS.includes(tabParam as ShopTab)
    ? (tabParam as ShopTab)
    : 'daily';

  const noFree = Object.fromEntries(FREE_SLOTS.map((s) => [s, false])) as Record<FreeSlot, boolean>;
  // 견습의 주머니(💎)는 전 유저 구매 가능 → 구매현황은 모두 로드. 현금/프리미엄은 어드민만 구매.
  const [free, purchased, premiumDays, hidePaid] = await Promise.all([
    withTimeout(getFreeStatus(userId, serverId), 3500, 'shop.free').catch(() => noFree),
    withTimeout(getPurchaseStatus(userId, serverId), 3500, 'shop.purchased').catch(() => [] as string[]),
    withTimeout(getPremiumRemainingDays(userId, serverId), 3500, 'shop.premium').catch(() => null),
    shouldHidePaidContent(),
  ]);

  // CBT 기간엔 일반 유저에게 유료 상품을 '준비 중'으로 표시(payEnabled=false). 무료 보급·견습의
  // 주머니(💎)는 payEnabled 무관하게 그대로 사용. 테스터 계정·정식 출시 시에는 실제 설정을 따름.
  const payEnabled = portoneConfig() !== null && !hidePaid;

  return (
    <ShopTabs
      free={free}
      isAdmin={isAdmin}
      payEnabled={payEnabled}
      purchased={purchased}
      premiumDays={premiumDays}
      initialTab={initialTab}
      returnPaymentId={sp.paymentId ?? null}
      returnCode={sp.code ?? null}
      identityStoreId={process.env.PORTONE_STORE_ID || process.env.NEXT_PUBLIC_PORTONE_STORE_ID}
      identityChannelKey={
        process.env.PORTONE_IDENTITY_CHANNEL_KEY ||
        process.env.NEXT_PUBLIC_PORTONE_IDENTITY_CHANNEL_KEY
      }
    />
  );
}
