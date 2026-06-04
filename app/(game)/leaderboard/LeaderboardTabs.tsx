'use client';

import Link from 'next/link';

import type { LeaderboardMetric } from '@/lib/game/leaderboard/queries';

const TABS: { key: LeaderboardMetric; label: string }[] = [
  { key: 'max', label: '최고 강화' },
  { key: 'sum', label: '합산 강화' },
  { key: 'combat', label: '전투력' },
  { key: 'raid', label: '레이드' },
  { key: 'melee', label: '대난투' },
];

export function LeaderboardTabs({ active }: { active: LeaderboardMetric }) {
  return (
    <div className="grid grid-cols-5 gap-1 rounded-full bg-zinc-100 p-1 dark:bg-zinc-900">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={`/leaderboard?tab=${t.key}`}
          className={
            active === t.key
              ? 'truncate rounded-full bg-white px-1.5 py-1.5 text-center text-[11px] font-semibold text-zinc-900 shadow-sm dark:bg-zinc-950 dark:text-zinc-50'
              : 'truncate rounded-full px-1.5 py-1.5 text-center text-[11px] text-zinc-500'
          }
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
