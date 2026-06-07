import { getSessionUserId } from '@/lib/auth/session';
import { withTimeout } from '@/lib/db/with-timeout';
import { getFreeStatus, FREE_SLOTS, type FreeSlot } from '@/lib/game/shop/free';

import { ShopTabs } from './ShopTabs';

/**
 * 상점 — WIREFRAMES §8. 상단 프리미엄 배너 + 탭(일일/주간/월간/충전).
 * 각 탭 최상단 무료 수령(주기 멱등, 결제 불필요). 유료/박스 상품은 결제 연동 전(클릭 시 토스트).
 */
export default async function ShopPage() {
  const userId = await getSessionUserId();
  if (!userId) return null;

  const noFree = Object.fromEntries(FREE_SLOTS.map((s) => [s, false])) as Record<FreeSlot, boolean>;
  const free = await withTimeout(getFreeStatus(userId), 3500, 'shop.free').catch(() => noFree);

  return <ShopTabs free={free} />;
}
