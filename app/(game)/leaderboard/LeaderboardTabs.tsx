'use client';

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
  return (
    <div className="grid grid-cols-5 gap-1 rounded-full bg-zinc-100 p-1 dark:bg-zinc-900">
      {TABS.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(t.key)}
          aria-pressed={active === t.key}
          className={
            active === t.key
              ? 'truncate rounded-full bg-white px-1.5 py-1.5 text-center text-[11px] font-semibold text-zinc-900 shadow-sm transition dark:bg-zinc-950 dark:text-zinc-50'
              : 'truncate rounded-full px-1.5 py-1.5 text-center text-[11px] text-zinc-500 transition'
          }
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
