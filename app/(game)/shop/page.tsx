import { eq } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { withTimeout } from '@/lib/db/with-timeout';
import { profiles } from '@/lib/db/schema/profiles';
import { getFreeStatus, FREE_SLOTS, type FreeSlot } from '@/lib/game/shop/free';

import { ShopTabs } from './ShopTabs';

/**
 * 상점 — WIREFRAMES §8. 상단 프리미엄 배너 + 탭(일일/주간/월간/충전).
 * 각 탭 최상단에 무료 수령 상품(주기 멱등, 결제 불필요). 현금 상품은 결제 연동 전 '준비 중'.
 */
export default async function ShopPage() {
  const userId = await getSessionUserId();
  if (!userId) return null;

  const noFree = Object.fromEntries(FREE_SLOTS.map((s) => [s, false])) as Record<FreeSlot, boolean>;
  const [pRows, free] = await Promise.all([
    withTimeout(
      db
        .select({ verifiedAt: profiles.identityVerifiedAt })
        .from(profiles)
        .where(eq(profiles.id, userId))
        .limit(1),
      3500,
      'shop.profile',
    ).catch(() => [] as { verifiedAt: Date | null }[]),
    withTimeout(getFreeStatus(userId), 3500, 'shop.free').catch(() => noFree),
  ]);

  return <ShopTabs verified={pRows[0]?.verifiedAt != null} free={free} />;
}
