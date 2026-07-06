import { getAdminStatus } from '@/lib/auth/require-admin';
import { shouldHidePaidContent } from '@/lib/auth/session';
import { getActiveServerId } from '@/lib/game/servers';
import { withTimeout } from '@/lib/db/with-timeout';
import { getFreeStatus, FREE_SLOTS, type FreeSlot } from '@/lib/game/shop/free';
import { getPurchaseStatus, getPremiumRemainingDays, hasFirstSpecial } from '@/lib/game/shop/dev-purchase';
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

  // CBT 기간 일반 유저 — 상품별 '준비 중' 토스트 대신 상점 전체를 준비 중으로 닫음(무료 수령·
  // 견습의 주머니 포함). 심사 계정은 결제 검수, 어드민은 테스트 구매를 위해 통과.
  // 정식 출시 시 ALLOW_TEST_LOGIN 해제로 자동 개방.
  if (!isAdmin && (await shouldHidePaidContent())) return <ShopClosed />;

  const sp = await searchParams;
  const tabParam = sp.tab;
  const initialTab: ShopTab = SHOP_TABS.includes(tabParam as ShopTab)
    ? (tabParam as ShopTab)
    : 'daily';

  const noFree = Object.fromEntries(FREE_SLOTS.map((s) => [s, false])) as Record<FreeSlot, boolean>;
  // 견습의 주머니(💎)는 전 유저 구매 가능 → 구매현황은 모두 로드. 현금/프리미엄은 어드민만 구매.
  const [free, purchased, premiumDays, hidePaid, firstSpecialDone] = await Promise.all([
    withTimeout(getFreeStatus(userId, serverId), 3500, 'shop.free').catch(() => noFree),
    withTimeout(getPurchaseStatus(userId, serverId), 3500, 'shop.purchased').catch(() => [] as string[]),
    withTimeout(getPremiumRemainingDays(userId, serverId), 3500, 'shop.premium').catch(() => null),
    shouldHidePaidContent(),
    // 첫 결제 특가 구매 여부(서버별 1회) — 구매 후 캐러셀에서 슬라이드 제거.
    withTimeout(hasFirstSpecial(userId, serverId), 3500, 'shop.firstSpecial').catch(() => true),
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
      firstSpecialDone={firstSpecialDone}
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

/** CBT 기간 상점 잠금 화면 — 정식 오픈까지 전체 준비 중. */
function ShopClosed() {
  return (
    <div className="flex min-h-[70dvh] flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="text-4xl" aria-hidden>
        🔨
      </div>
      <p className="text-lg font-bold">상점 준비 중</p>
    </div>
  );
}
