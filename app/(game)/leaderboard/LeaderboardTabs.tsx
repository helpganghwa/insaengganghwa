'use client';

import Link from 'next/link';

import type { LeaderboardMetric } from '@/lib/game/leaderboard/queries';

const TABS: { key: LeaderboardMetric; label: string }[] = [
  { key: 'max', label: '최고 강화' },
  { key: 'sum', label: '합산 강화' },
  { key: 'combat', label: '전투력' },
];

export function LeaderboardTabs({ active }: { active: LeaderboardMetric }) {
  return (
    <div className="grid grid-cols-3 gap-1 rounded-full bg-zinc-100 p-1 dark:bg-zinc-900">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={`/leaderboard?tab=${t.key}`}
          className={
            active === t.key
              ? 'rounded-full bg-white px-3 py-1.5 text-center text-xs font-semibold text-zinc-900 shadow-sm dark:bg-zinc-950 dark:text-zinc-50'
              : 'rounded-full px-3 py-1.5 text-center text-xs text-zinc-500'
          }
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
