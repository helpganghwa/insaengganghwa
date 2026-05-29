import Link from 'next/link';

import { getRankingTop, type LeaderboardMetric } from '@/lib/game/leaderboard/queries';

/**
 * 홈 §1 — Top 3 명예의 전당 카드. 진입마다 metric(최고/합산/전투력) 랜덤 노출.
 * 헤더는 pixellab 배너 배경 + 랭킹 진입. 본문은 leaderboard 상세와 동일 구성.
 */
const HOF_BG = '/sprites/hof-bg.png?v=3';
const HEADER_BG = '/sprites/hof-header.png';
const METRICS: LeaderboardMetric[] = ['max', 'sum', 'combat'];
const LABEL: Record<LeaderboardMetric, string> = {
  max: '최고 강화',
  sum: '합산 강화',
  combat: '전투력',
};

export async function RankingTop3Card() {
  const metric = METRICS[crypto.getRandomValues(new Uint32Array(1))[0]! % METRICS.length]!;
  const top = await getRankingTop(metric, 3);
  if (top.length === 0) return null;

  return (
    <section
      aria-label={`${LABEL[metric]} 랭킹`}
      className="overflow-hidden rounded-xl border border-amber-900/50 shadow-lg shadow-black/40"
    >
      {/* 헤더 — pixellab 배너 배경 + 랭킹 진입 */}
      <Link
        href="/leaderboard"
        className="relative flex items-center gap-1.5 overflow-hidden border-b border-amber-700/40 px-3.5 py-2.5 transition hover:brightness-110"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={HEADER_BG}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover"
          style={{ imageRendering: 'pixelated' }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/55 to-black/25" />
        <span className="relative" aria-hidden>
          🏆
        </span>
        <span className="relative text-[12px] font-bold text-amber-100 drop-shadow-[0_1px_2px_rgba(0,0,0,1)]">
          {LABEL[metric]} 랭킹
        </span>
      </Link>

      <div className="relative w-full" style={{ aspectRatio: '400 / 174' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={HOF_BG}
          alt=""
          aria-hidden
          className="absolute inset-0 h-[105%] w-full object-fill"
          style={{ imageRendering: 'pixelated' }}
        />
        <div className="absolute inset-0 flex items-end justify-center gap-0.5 px-1 py-1.5">
          {[top[1], top[0], top[2]]
            .filter((e): e is (typeof top)[number] => !!e)
            .map((e) => {
              const first = e.rank === 1;
              return (
                <Link
                  key={e.userId}
                  href={`/u/${encodeURIComponent(e.nickname)}`}
                  className={`flex min-w-0 flex-1 flex-col items-center self-stretch ${
                    first ? 'z-10' : ''
                  }`}
                >
                  <div className="flex w-full items-center justify-center gap-0.5 px-0.5 pt-1">
                    <span className="font-mono text-[11px] leading-none tabular-nums text-white drop-shadow-[0_1px_2px_rgba(0,0,0,1)]">
                      #{e.rank}
                    </span>
                    <span className="truncate text-[11px] font-medium text-white drop-shadow-[0_1px_2px_rgba(0,0,0,1)]">
                      {e.nickname}
                    </span>
                  </div>
                  <div className="relative w-full flex-1">
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
                          transform: 'scale(1.49) translateY(calc(5% + 15px))',
                          transformOrigin: 'center bottom',
                          filter: 'drop-shadow(0 3px 5px rgba(0,0,0,0.55))',
                        }}
                      />
                    ) : null}
                  </div>
                  <span className="pb-1 font-mono text-[11px] font-bold tabular-nums text-amber-200 drop-shadow-[0_1px_2px_rgba(0,0,0,1)]">
                    {e.value.toLocaleString('ko-KR')}
                  </span>
                </Link>
              );
            })}
        </div>
      </div>
    </section>
  );
}
