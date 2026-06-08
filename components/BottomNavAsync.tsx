import type { LayoutData } from '@/lib/game/layout-data';

import { BottomNav } from './BottomNav';

/** Suspense 경계 안에서 강화완료 dot await → 클라 BottomNav 렌더(콜드여도 네비 셸 즉시). */
export async function BottomNavAsync({ dataPromise }: { dataPromise: Promise<LayoutData> }) {
  const d = await dataPromise;
  return (
    <BottomNav
      hasCompletedEnhance={d.hasCompletedEnhance}
      hasShopFree={d.hasShopFree}
      hasFriendRequest={d.hasFriendRequest}
    />
  );
}
