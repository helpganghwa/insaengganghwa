import { eq } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { withTimeout } from '@/lib/db/with-timeout';
import { profiles } from '@/lib/db/schema/profiles';

import { ShopTabs } from './ShopTabs';

/**
 * 상점 — WIREFRAMES §8. 탭형(일일/주간/월간 특가 · 프리미엄 · 다이아 충전).
 * 결제 백엔드(포트원/IAP/본인인증)는 후속 — 현재 전 상품 '준비 중'. 보유 다이아는 상단 헤더.
 */
export default async function ShopPage() {
  const userId = await getSessionUserId();
  if (!userId) return null;

  // 콜드 DB hang 방지 — 실패 시 미인증으로 degrade.
  const pRows = await withTimeout(
    db
      .select({ verifiedAt: profiles.identityVerifiedAt })
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1),
    3500,
    'shop.profile',
  ).catch(() => [] as { verifiedAt: Date | null }[]);

  return <ShopTabs verified={pRows[0]?.verifiedAt != null} />;
}
