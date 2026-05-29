import Link from 'next/link';

import { getRankingTop } from '@/lib/game/leaderboard/queries';

/**
 * 홈 §1 — 최고 강화 Top 3 카드. 랭킹 상세(leaderboard)의 명예의 전당과 동일 구성:
 * 배경(hof) + 1·2·3위 전신(2위 좌·1위 중앙·3위 우) + #순위/닉네임(위)·수치(아래).
 */
const HOF_BG = '/sprites/hof-bg.png?v=3';

export async function RankingTop3Card() {
  const top = await getRankingTop('max', 3);
  if (top.length === 0) return null;

  return (
    <section
      aria-label="최고 강화 랭킹"
      className="overflow-hidden rounded-xl border border-amber-900/50 shadow-lg shadow-black/40"
    >
      <header className="flex items-baseline justify-between bg-stone-950/70 px-3.5 py-2">
        <h2 className="flex items-center gap-1.5 text-[12px] font-bold text-amber-200">
          <span aria-hidden>🏆</span>
          <span>최고 강화 랭킹</span>
        </h2>
        <Link
          href="/leaderboard"
          className="text-[10px] font-medium text-amber-300/80 hover:text-amber-200"
        >
          전체 →
        </Link>
      </header>

      <div className="relative w-full" style={{ aspectRatio: '400 / 174' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={HOF_BG}
          alt=""
          aria-hidden
          className="absolute inset-0 h-[105%] w-full object-fill"
          style={{ imageRendering: 'pixelated' }}
        />
        {/* 1·2·3위 전신 — 2위(좌)·1위(중앙)·3위(우) */}
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
                  {/* 위 — #순위 + 닉네임 */}
                  <div className="flex w-full items-center justify-center gap-0.5 px-0.5 pt-1">
                    <span className="font-mono text-[11px] leading-none tabular-nums text-white drop-shadow-[0_1px_2px_rgba(0,0,0,1)]">
                      #{e.rank}
                    </span>
                    <span className="truncate text-[11px] font-medium text-white drop-shadow-[0_1px_2px_rgba(0,0,0,1)]">
                      {e.nickname}
                    </span>
                  </div>
                  {/* 중앙 — 캐릭터 전신 */}
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
                  {/* 아래 — 수치(순수 숫자) */}
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
