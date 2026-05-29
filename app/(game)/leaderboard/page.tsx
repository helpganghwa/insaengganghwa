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

      <section className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
        {top.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-zinc-400">
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
                    className={`relative flex h-16 items-center gap-2.5 overflow-hidden border-b border-zinc-800 px-3 last:border-b-0 ${
                      e.userId === userId ? 'ring-2 ring-inset ring-amber-400' : ''
                    }`}
                  >
                    {/* 캐릭터 — 우측, 행보다 크게 바닥 정렬(상반신 노출) */}
                    {e.profileImg && (
                      <div
                        aria-hidden
                        className="absolute inset-y-0 right-0 w-40"
                        style={{
                          backgroundImage: `url(${e.profileImg})`,
                          backgroundSize: '200% auto', // 확대(얼굴 클로즈업)
                          backgroundPosition: '50% 13%', // 얼굴 전체 + 어깨 살짝(상단)
                          backgroundRepeat: 'no-repeat',
                          imageRendering: 'pixelated',
                        }}
                      />
                    )}
                    {/* 좌→우 그라데이션 (좌측 텍스트 가독, 우측 캐릭터 노출) */}
                    <div className="absolute inset-0 bg-gradient-to-r from-zinc-950/95 via-zinc-950/65 to-zinc-950/15" />

                    <span className="relative w-7 shrink-0 text-center font-mono text-sm tabular-nums text-white">
                      {medal ?? `#${e.rank}`}
                    </span>
                    <span className="relative flex-1 truncate text-sm font-semibold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                      {e.nickname}
                    </span>
                    <span className="relative font-mono text-sm tabular-nums text-amber-200 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
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
