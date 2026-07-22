import Link from 'next/link';
import { getActiveServerId } from '@/lib/game/servers';
import { profileHref } from '@/lib/game/profile/href';

import { getSessionUserId } from '@/lib/auth/session';
import { getLeaderboardPayload, type LeaderboardMetric } from '@/lib/game/leaderboard/queries';
import { GuildBadge } from '@/components/GuildBadge';
import { LeaderboardTabs } from './LeaderboardTabs';

const LABEL: Record<LeaderboardMetric, string> = {
  max: '최고 강화',
  sum: '합산 강화',
  combat: '전투력',
  raid: '레이드 처치',
  melee: '대난투', // 2026-07-22 개편 — 값=감쇠 랭킹 포인트(반감기 14일)
};
// 탭별 산정 기준 캡션 — 내 순위 카드 아래 상시 표시(A안, 2026-07-22).
const CRITERIA: Record<LeaderboardMetric, string> = {
  max: '보유 장비 중 가장 높은 강화 레벨이에요.',
  sum: '보유 장비 전체의 강화 레벨을 더한 값이에요.',
  combat: '보유 장비 전체의 전투력을 더한 값이에요.',
  raid: '처치에 성공한 레이드에 참여한 횟수예요.',
  melee: '대난투 순위로 얻는 랭킹 포인트에요. 최근 성적일수록 크게 반영돼요.',
};
// metric별 명예의 전당 배경(현재 전부 동일 전당 배경 사용).
const BG: Record<LeaderboardMetric, string> = {
  max: '/sprites/hof-bg.png?v=3',
  sum: '/sprites/hof-bg.png?v=3',
  combat: '/sprites/hof-bg.png?v=3',
  raid: '/sprites/hof-bg.png?v=3',
  melee: '/sprites/hof-bg.png?v=3',
};
// 수치는 순수 숫자(천단위 콤마)만 — 접두/이모지/축약 없이 전체 노출
function fmt(v: number): string {
  return v.toLocaleString('ko-KR');
}
function parse(t: string | undefined): LeaderboardMetric {
  return t === 'sum' || t === 'combat' || t === 'raid' || t === 'melee' ? t : 'max';
}

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const userId = await getSessionUserId();
  if (!userId) return null;
  const metric = parse((await searchParams).tab);
  const serverId = await getActiveServerId();
  const { top, mine } = await getLeaderboardPayload(metric, serverId, userId);

  return (
    <div className="space-y-4 px-4 py-4">
      <LeaderboardTabs active={metric} />

      <section className="flex items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 dark:border-amber-700 dark:bg-amber-950/50">
        <span className="text-xs text-amber-700 dark:text-amber-300">내 {LABEL[metric]} 순위</span>
        <span className="font-mono text-sm font-bold text-amber-900 dark:text-amber-100">
          {mine
            ? `#${mine.rank.toLocaleString('ko-KR')} · ${fmt(mine.value)}`
            : '기록을 쌓으면 집계됩니다'}
        </span>
      </section>
      {/* space-y-4(16px)를 -mt로 좁혀 카드에 종속된 캡션으로 보이게(6px 간격). */}
      <p className="-mt-2.5 px-1 text-[10px] leading-relaxed text-zinc-500">{CRITERIA[metric]}</p>

      {top.length === 0 ? (
        <section className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-10 text-center text-sm text-zinc-400">
          아직 랭킹에 오른 유저가 없습니다.
        </section>
      ) : (
        <>
          {/* Top 3 — 명예의 전당 (pixellab 배경 + 전신 높이차) */}
          <section className="isolate overflow-hidden rounded-xl border border-amber-900/50 shadow-lg shadow-black/40">
            <div className="relative w-full" style={{ aspectRatio: '400 / 174' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={BG[metric]}
                alt=""
                aria-hidden
                className="absolute inset-0 h-[105%] w-full object-fill"
                style={{ imageRendering: 'pixelated' }}
              />
              {/* 1·2·3위 전신 — 2위(좌)·1위(중앙, 큼)·3위(우). 텍스트는 drop-shadow로 가독 확보 */}
              <div className="absolute inset-0 flex items-end justify-center gap-0.5 px-1 pb-0.5 pt-1">
                {/* 항상 3분할 — 2/1/3 자리. 데이터 없으면 placeholder로 슬롯 유지. */}
                {[
                  { slot: 2 as const, entry: top[1] ?? null },
                  { slot: 1 as const, entry: top[0] ?? null },
                  { slot: 3 as const, entry: top[2] ?? null },
                ].map(({ slot, entry }) => {
                  const first = slot === 1;
                  if (!entry) {
                    return (
                      <div
                        key={`empty-${slot}`}
                        className={`flex min-w-0 flex-1 flex-col items-center self-stretch ${
                          first ? 'z-10' : ''
                        }`}
                      >
                        <div className="flex w-full items-center justify-center gap-0.5 px-0.5 pt-1">
                          <span className="text-pixel-outline font-mono text-[11px] leading-none text-white/55 tabular-nums">
                            #{slot}
                          </span>
                          <span className="text-pixel-outline truncate text-[11px] font-medium text-white/55">
                            —
                          </span>
                        </div>
                        {/* 길드 행 placeholder — 칸 높이 통일(아바타 크기 동일). */}
                        <div className="h-[12px] w-full" aria-hidden />
                        <div className="relative w-full flex-1" aria-hidden />
                        <span className="text-pixel-outline pb-0 font-mono text-[11px] font-bold text-amber-200/55 tabular-nums">
                          —
                        </span>
                      </div>
                    );
                  }
                  return (
                    <Link prefetch={false}
                      key={entry.userId}
                      href={profileHref(entry.publicCode, serverId)}
                      className={`flex min-w-0 flex-1 flex-col items-center self-stretch ${
                        first ? 'z-10' : ''
                      }`}
                    >
                      <div className="flex w-full items-center justify-center gap-0.5 px-0.5 pt-1">
                        <span className="text-pixel-outline font-mono text-[11px] leading-none font-bold text-amber-300 tabular-nums">
                          #{entry.rank}
                        </span>
                        <span className="text-pixel-outline truncate text-[10px] font-medium leading-tight text-white">
                          {entry.nickname}
                        </span>
                      </div>
                      {/* 길드 — 이름 밑(문양 + 길드명). 미소속이면 빈 줄로 높이만 유지. */}
                      <div className="flex h-[12px] w-full items-center justify-center gap-0.5 px-0.5">
                        {entry.guildName ? (
                          <>
                            <GuildBadge emblemUrl={entry.guildEmblemUrl ?? null} size={11} className="shrink-0" />
                            <span className="text-pixel-outline truncate text-[9px] font-medium leading-none text-amber-100/90">
                              {entry.guildName}
                            </span>
                          </>
                        ) : null}
                      </div>
                      <div className="relative w-full flex-1">
                        {entry.profileImg && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={entry.profileImg}
                            alt=""
                            aria-hidden
                            draggable={false}
                            className="absolute inset-0 h-full w-full object-contain object-bottom"
                            style={{
                              imageRendering: 'pixelated',
                              // v3 풀프레임 — 줌·하향보정 제거(여백 없어 그대로 영역에 꽉 참).
                              transformOrigin: 'center bottom',
                              filter: 'drop-shadow(0 3px 5px rgba(0,0,0,0.55))',
                            }}
                          />
                        )}
                      </div>
                      <span className="text-pixel-outline pb-0 font-mono text-[11px] font-bold text-amber-200 tabular-nums">
                        {fmt(entry.value)}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          </section>

          {/* 4위~ — 텍스트 목록 */}
          {top.length > 3 && (
            <section className="isolate overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
              <ul>
                {top.slice(3).map((e, i, rows) => {
                  const me = e.userId === userId;
                  // 첫/마지막 행이면 부모(rounded-xl overflow-hidden)의 둥근 모서리에 사각 링이
                  // 잘리므로, 그 행의 링만 같은 방향으로 둥글려 클립과 정렬(중간 행은 사각 유지).
                  // ⚠ first:/last: 의사클래스는 li의 유일 자식(Link)엔 항상 참이라 못 씀 → 인덱스로 판정.
                  const meRound = me
                    ? `${i === 0 ? 'rounded-t-xl ' : ''}${i === rows.length - 1 ? 'rounded-b-xl ' : ''}`
                    : '';
                  return (
                    <li key={e.userId}>
                      <Link prefetch={false}
                        href={profileHref(e.publicCode, serverId)}
                        className={`flex h-14 items-center gap-2.5 border-b border-zinc-800 px-3 last:border-b-0 ${
                          me ? `bg-amber-400/10 ring-1 ring-amber-400/60 ring-inset ${meRound}` : ''
                        }`}
                      >
                        <span className="w-7 shrink-0 text-center font-mono text-sm text-zinc-400 tabular-nums">
                          #{e.rank}
                        </span>
                        {/* 아바타 — 닉네임 왼쪽(길드원 목록과 동일) */}
                        <span className="h-9 w-9 shrink-0 overflow-hidden rounded-lg">
                          {e.profileImg ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={e.profileImg}
                              alt=""
                              aria-hidden
                              className="h-full w-full object-contain"
                              style={{ imageRendering: 'pixelated' }}
                            />
                          ) : null}
                        </span>
                        {/* 닉네임(위) + 길드명·문양(아래) */}
                        <span className="flex min-w-0 flex-1 flex-col justify-center">
                          <span className="truncate text-sm font-medium text-white">{e.nickname}</span>
                          {e.guildName || e.guildEmblemUrl ? (
                            <GuildBadge
                              emblemUrl={e.guildEmblemUrl ?? null}
                              name={e.guildName ?? null}
                              size={11}
                              className="mt-0.5 max-w-full text-[10px] text-zinc-400"
                            />
                          ) : null}
                        </span>
                        <span className="font-mono text-sm text-amber-200 tabular-nums">
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
    </div>
  );
}
