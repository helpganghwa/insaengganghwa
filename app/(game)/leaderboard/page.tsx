import Link from 'next/link';

import { getSessionUserId } from '@/lib/auth/session';
import {
  getLeaderboardPayload,
  type LeaderboardMetric,
} from '@/lib/game/leaderboard/queries';
import { LeaderboardTabs } from './LeaderboardTabs';

const LABEL: Record<LeaderboardMetric, string> = {
  max: '최고 강화',
  sum: '합산 강화',
  combat: '전투력',
};
// metric별 명예의 전당 배경 — 최고=전당, 합산=대장간, 전투력=투기장
const BG: Record<LeaderboardMetric, string> = {
  max: '/sprites/hof-bg.png?v=3',
  sum: '/sprites/hof-bg.png?v=3',
  combat: '/sprites/hof-bg.png?v=3',
};
// 수치는 순수 숫자(천단위 콤마)만 — 접두/이모지/축약 없이 전체 노출
function fmt(v: number): string {
  return v.toLocaleString('ko-KR');
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

      <section className="flex items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 dark:border-amber-700 dark:bg-amber-950/50">
        <span className="text-xs text-amber-700 dark:text-amber-300">
          내 {LABEL[metric]} 순위
        </span>
        <span className="font-mono text-sm font-bold text-amber-900 dark:text-amber-100">
          {mine
            ? `#${mine.rank.toLocaleString('ko-KR')} · ${fmt(mine.value)}`
            : '기록을 쌓으면 집계됩니다'}
        </span>
      </section>

      {top.length === 0 ? (
        <section className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-10 text-center text-sm text-zinc-400">
          아직 랭킹에 오른 유저가 없습니다.
        </section>
      ) : (
        <>
          {/* Top 3 — 명예의 전당 (pixellab 배경 + 전신 높이차) */}
          <section className="overflow-hidden rounded-xl border border-amber-900/50 shadow-lg shadow-black/40">
            <div className="relative w-full" style={{ aspectRatio: '400 / 174' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={BG[metric]}
                alt=""
                aria-hidden
                className="absolute inset-0 h-full w-full object-fill"
                style={{ imageRendering: 'pixelated' }}
              />
              {/* 1·2·3위 전신 — 2위(좌)·1위(중앙, 큼)·3위(우). 텍스트는 drop-shadow로 가독 확보 */}
              <div className="absolute inset-0 flex items-end justify-center gap-0.5 px-1 pb-1.5">
                {[top[1], top[0], top[2]]
                  .filter((e): e is (typeof top)[number] => !!e)
                  .map((e) => {
                    const first = e.rank === 1;
                    const rankColor = e.rank === 1 ? 'text-amber-300' : 'text-white';
                    return (
                      <Link
                        key={e.userId}
                        href={`/u/${encodeURIComponent(e.nickname)}`}
                        className={`flex min-w-0 flex-col items-center self-stretch ${
                          first ? 'flex-[1.35] z-10' : 'flex-1'
                        }`}
                      >
                        {/* 위 — 메달 + 닉네임 */}
                        <div className="flex w-full items-center justify-center gap-0.5 px-0.5 pt-1">
                          <span
                            className={`font-mono text-[11px] tabular-nums leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,1)] ${rankColor}`}
                          >
                            #{e.rank}
                          </span>
                          <span
                            className={`truncate text-[11px] font-medium drop-shadow-[0_1px_2px_rgba(0,0,0,1)] ${rankColor}`}
                          >
                            {e.nickname}
                          </span>
                        </div>
                        {/* 중앙 — 캐릭터 전신 */}
                        <div className="relative w-full flex-1">
                          {e.profileImg && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={e.profileImg}
                              alt=""
                              aria-hidden
                              draggable={false}
                              className="absolute inset-0 h-full w-full object-contain object-bottom"
                              style={{
                                imageRendering: 'pixelated',
                                transform: 'scale(1.49) translateY(calc(5% + 15px))',
                                transformOrigin: 'center bottom',
                                filter: 'drop-shadow(0 3px 5px rgba(0,0,0,0.55))',
                              }}
                            />
                          )}
                        </div>
                        {/* 아래 — 수치(순수 숫자) */}
                        <span className="pb-1 font-mono text-[11px] font-bold tabular-nums text-amber-200 drop-shadow-[0_1px_2px_rgba(0,0,0,1)]">
                          {fmt(e.value)}
                        </span>
                      </Link>
                    );
                  })}
              </div>
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
                          {fmt(e.value)}
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
