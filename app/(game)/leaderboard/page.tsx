import Link from 'next/link';

import { getSessionUserId } from '@/lib/auth/session';
import {
  getLeaderboardPayload,
  type LeaderboardMetric,
} from '@/lib/game/leaderboard/queries';
import { formatCompactKR } from '@/lib/ui/format-number';

import { LeaderboardTabs } from './LeaderboardTabs';

const LABEL: Record<LeaderboardMetric, string> = {
  max: '최고 강화',
  sum: '합산 강화',
  combat: '전투력',
};
function fmt(m: LeaderboardMetric, v: number): string {
  if (m === 'max') return `+${v}`;
  if (m === 'sum') return `합 ${formatCompactKR(v)}`;
  return `⚔️ ${formatCompactKR(v)}`;
}
function parse(t: string | undefined): LeaderboardMetric {
  return t === 'sum' || t === 'combat' ? t : 'max';
}

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const userId = await getSessionUserId();
  if (!userId) return null;
  const metric = parse((await searchParams).tab);
  const { top, mine } = await getLeaderboardPayload(metric, userId);

  return (
    <div className="space-y-4 px-4 py-4">
      <h1 className="text-lg font-semibold">🏆 랭킹</h1>
      <LeaderboardTabs active={metric} />

      <section className="rounded-xl border-2 border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-700 dark:bg-amber-950/50">
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-amber-700 dark:text-amber-300">
            내 {LABEL[metric]} 순위
          </span>
          <span className="font-mono text-lg font-bold text-amber-900 dark:text-amber-100">
            {mine ? `#${mine.rank.toLocaleString('ko-KR')}` : '—'}
          </span>
        </div>
        <div className="mt-1 text-xs text-amber-700/80 dark:text-amber-300/80">
          {mine ? fmt(metric, mine.value) : '기록을 쌓으면 집계됩니다'}
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
        {top.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-zinc-500">
            아직 랭킹에 오른 유저가 없습니다.
          </div>
        ) : (
          <ul>
            {top.map((e) => {
              const medal =
                e.rank === 1 ? '🥇' : e.rank === 2 ? '🥈' : e.rank === 3 ? '🥉' : null;
              return (
                <li key={e.userId}>
                  <Link
                    href={`/u/${encodeURIComponent(e.nickname)}`}
                    className={`flex items-center gap-3 border-b border-zinc-100 px-4 py-2.5 last:border-b-0 dark:border-zinc-900 ${
                      e.userId === userId ? 'bg-amber-50 dark:bg-amber-950/40' : ''
                    }`}
                  >
                    <span className="w-9 shrink-0 text-center font-mono text-sm tabular-nums">
                      {medal ?? `#${e.rank}`}
                    </span>
                    <span className="flex-1 truncate text-sm font-medium">{e.nickname}</span>
                    <span className="font-mono text-sm tabular-nums text-zinc-700 dark:text-zinc-300">
                      {fmt(metric, e.value)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <p className="text-center text-xs text-zinc-400">상시 누적 · Top 100 (시즌 없음)</p>
    </div>
  );
}
