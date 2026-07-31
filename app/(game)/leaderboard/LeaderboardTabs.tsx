'use client';

import { Tabs } from '@/components/ui/Tabs';
import type { LeaderboardMetric } from '@/lib/game/leaderboard/queries';

const TABS: { key: LeaderboardMetric; label: string }[] = [
  { key: 'max', label: '최고 강화' },
  { key: 'sum', label: '합산 강화' },
  { key: 'combat', label: '전투력' },
  { key: 'raid', label: '레이드' },
  { key: 'melee', label: '대난투' },
];

/**
 * 랭킹 탭 — 5지표 데이터를 페이지가 한 번에 받아두므로 여기서는 상태만 바꾼다.
 * 이전에는 `/leaderboard?tab=` 링크라 탭을 누를 때마다 페이지 전체를 다시 받았다
 * (layout 재렌더 포함) — 길드 랭킹과 같은 무왕복 전환으로 통일(2026-07-31).
 */
export function LeaderboardTabs({
  active,
  onChange,
}: {
  active: LeaderboardMetric;
  onChange: (m: LeaderboardMetric) => void;
}) {
  // 5개라 라벨이 길다 — 공용 탭은 truncate + flex-1이라 균등 분할·말줄임이 그대로 적용된다.
  return <Tabs items={TABS} value={active} onChange={onChange} />;
}
