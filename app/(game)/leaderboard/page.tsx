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

      {top.length === 0 ? (
        <section className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-10 text-center text-sm text-zinc-400">
          아직 랭킹에 오른 유저가 없습니다.
        </section>
      ) : (
        <>
          {/* Top 3 — CSS 시상대 (2위 좌·1위 중앙 큼·3위 우, 전신 캐릭터) */}
          <section className="overflow-hidden rounded-xl border border-zinc-800 bg-gradient-to-b from-zinc-800/60 via-zinc-900 to-zinc-950 px-2 pt-5">
            <div className="flex items-end justify-center gap-1.5">
              {[top[1], top[0], top[2]]
                .filter((e): e is (typeof top)[number] => !!e)
                .map((e) => {
                  const first = e.rank === 1;
                  const medal = e.rank === 1 ? '🥇' : e.rank === 2 ? '🥈' : '🥉';
                  const podClr =
                    e.rank === 1
                      ? 'from-amber-300 to-amber-500 text-amber-950'
                      : e.rank === 2
                        ? 'from-zinc-300 to-zinc-400 text-zinc-800'
                        : 'from-amber-600 to-amber-800 text-amber-50';
                  const podH = e.rank === 1 ? 'h-16' : e.rank === 2 ? 'h-11' : 'h-8';
                  const me = e.userId === userId;
                  return (
                    <Link
                      key={e.userId}
                      href={`/u/${encodeURIComponent(e.nickname)}`}
                      className={`flex min-w-0 flex-col items-center ${first ? 'flex-[1.3]' : 'flex-1'}`}
                    >
                      <div className="relative w-full" style={{ aspectRatio: '3 / 4' }}>
                        {e.profileImg ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={e.profileImg}
                            alt=""
                            aria-hidden
                            draggable={false}
                            className="absolute inset-0 h-full w-full object-contain object-bottom"
                            style={{
                              imageRendering: 'pixelated',
                              transform: first ? 'scale(1.12)' : 'scale(0.92)',
                              transformOrigin: 'center bottom',
                            }}
                          />
                        ) : (
                          <div className="absolute inset-x-3 bottom-0 top-4 rounded-lg bg-zinc-800" />
                        )}
                      </div>
                      <span
                        className={`mt-0.5 max-w-full truncate px-1 font-semibold drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] ${first ? 'text-sm' : 'text-xs'} ${me ? 'text-amber-300' : 'text-white'}`}
                      >
                        {e.nickname}
                      </span>
                      <span className="font-mono text-[10px] tabular-nums text-amber-200">
                        {fmt(metric, e.value)}
                      </span>
                      <div
                        className={`mt-1 flex w-full flex-col items-center justify-start rounded-t-md bg-gradient-to-b pt-1 ${podClr} ${podH} ${me ? 'ring-2 ring-inset ring-amber-400' : ''}`}
                      >
                        <span className="text-base leading-none">{medal}</span>
                        <span className="text-xs font-extrabold leading-tight">{e.rank}</span>
                      </div>
                    </Link>
                  );
                })}
            </div>
          </section>

          {/* 4위~ — 텍스트 목록 */}
          {top.length > 3 && (
            <section className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
              <ul>
                {top.slice(3).map((e) => {
                  const me = e.userId === userId;
                  return (
                    <li key={e.userId}>
                      <Link
                        href={`/u/${encodeURIComponent(e.nickname)}`}
                        className={`flex h-12 items-center gap-2.5 border-b border-zinc-800 px-3 last:border-b-0 ${
                          me ? 'bg-amber-400/10 ring-1 ring-inset ring-amber-400/60' : ''
                        }`}
                      >
                        <span className="w-7 shrink-0 text-center font-mono text-sm tabular-nums text-zinc-400">
                          #{e.rank}
                        </span>
                        <span className="flex-1 truncate text-sm font-medium text-white">
                          {e.nickname}
                        </span>
                        <span className="font-mono text-sm tabular-nums text-amber-200">
                          {fmt(metric, e.value)}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </>
      )}
      <p className="text-center text-xs text-zinc-400">상시 누적 · Top 100 (시즌 없음)</p>
    </div>
  );
}
