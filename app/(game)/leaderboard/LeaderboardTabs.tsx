'use client';

import { Tabs } from '@/components/ui/Tabs';
import type { LeaderboardMetric } from '@/lib/game/leaderboard/queries';

const TABS: { key: LeaderboardMetric; label: string }[] = [
  { key: 'max', label: '최고 강화' },
  { key: 'sum', label: '합산 강화' },
  { key: 'combat', label: '전투력' },
  { key: 'raid', label: '레이드' },
  { key: 'melee', label: '대난투' },
  { key: 'tower', label: '무한의 탑' },
];

/**
 * 랭킹 탭 — 6지표 데이터를 페이지가 한 번에 받아두므로 여기서는 상태만 바꾼다.
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
  // 6개를 한 줄에 두면 빽빽해(360폭 한 칸 ≈50px) 3칸 2줄로(2026-09-30). 칸이 넓어져 '무한의 탑'도 줄이지 않는다.
  return <Tabs items={TABS} value={active} onChange={onChange} cols={3} />;
}
