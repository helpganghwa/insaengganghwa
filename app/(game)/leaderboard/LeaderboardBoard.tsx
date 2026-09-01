'use client';

import { memo, useRef, useState } from 'react';
import Link from 'next/link';

import { GuildBadge } from '@/components/GuildBadge';
import { profileHref } from '@/lib/game/profile/href';
import type {
  LeaderboardEntry,
  LeaderboardMetric,
  MyRankSnap,
} from '@/lib/game/leaderboard/queries';

import { LeaderboardTabs } from './LeaderboardTabs';
import { PageHeader } from '@/components/ui/PageHeader';

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

export type LeaderboardPayloads = Record<
  LeaderboardMetric,
  { top: LeaderboardEntry[]; mine: MyRankSnap }
>;

/**
 * 랭킹 보드 — 5지표 데이터를 서버에서 한 번에 받아 탭 전환은 클라에서(무왕복).
 * 초기 탭은 `?tab=`(RankingDeck 등 깊은 링크)을 따르되, 이후 전환은 URL을 건드리지
 * 않는다 — 쿼리를 바꾸면 라우트가 커밋되며 페이지를 다시 받게 되기 때문(2026-07-31).
 */
/**
 * 헤더(ⓘ 산정 기준 토글 포함) — infoOpen state를 이 컴포넌트가 소유(2026-08-07 렌더 감사).
 * 이전엔 ⓘ 토글마다 Top3 아트+최대 100행 목록 전체가 리렌더됐다. props(metric·mine)는
 * metric 전환 시에만 바뀌므로 memo가 실효.
 */
const BoardHeader = memo(function BoardHeader({
  metric,
  mine,
}: {
  metric: LeaderboardMetric;
  mine: LeaderboardPayloads[LeaderboardMetric]['mine'];
}) {
  const [infoOpen, setInfoOpen] = useState(false);
  return (
    <div className="px-4 pb-3 pt-3">
      {/* 내 순위는 헤더 우측 한 곳에서만 — 종전엔 상단 카드와 목록 하이라이트로 두 번 나오면서
          세로 90px을 썼다. 산정 기준은 상시 두 줄을 먹던 캡션 대신 ⓘ로 접었다(2026-08-02). */}
      <PageHeader
        title="랭킹"
        fallback="/me"
        kicker={
          <span className="inline-flex items-baseline gap-1">
            {LABEL[metric]}
            <button
              type="button"
              onClick={() => setInfoOpen((v) => !v)}
              aria-label="산정 기준"
              aria-expanded={infoOpen}
              className="relative inline-flex h-[13px] w-[13px] translate-y-px items-center justify-center rounded-full border border-zinc-400 text-[9px] font-bold leading-none text-zinc-400 after:absolute after:-inset-2 after:content-[''] dark:border-zinc-600"
            >
              i
            </button>
          </span>
        }
        right={
          <span className="font-mono text-[12.5px] font-bold tabular-nums text-amber-500">
            {mine ? `#${mine.rank.toLocaleString('ko-KR')} · ${fmt(mine.value)}` : '기록 없음'}
          </span>
        }
      />
      {infoOpen ? (
        <p className="mt-2 rounded-lg bg-zinc-100 px-3 py-2 text-[11px] leading-relaxed text-zinc-500 dark:bg-zinc-900">
          {CRITERIA[metric]}
        </p>
      ) : null}
    </div>
  );
});

export function LeaderboardBoard({
  initial,
  payloads,
  serverId,
  userId,
}: {
  initial: LeaderboardMetric;
  payloads: LeaderboardPayloads;
  serverId: number;
  userId: string;
}) {
  const [metric, setMetric] = useState<LeaderboardMetric>(initial);
  // 탭 lazy(감사 C) — 초기 탭 외에는 20행 미리보기만 실려 온다. 전환 시 100행을 **패칭
  // 완료 후 전환**(빈 목록/시프트 금지 — 2026-08-20 사용자 지시). 실패 시 20행 폴백 전환.
  const [fullTops, setFullTops] = useState<Partial<Record<LeaderboardMetric, LeaderboardEntry[]>>>({});
  const pendingRef = useRef(false);
  const switchMetric = (m: LeaderboardMetric) => {
    if (m === metric || pendingRef.current) return;
    if (m === initial || fullTops[m]) {
      setMetric(m);
      return;
    }
    pendingRef.current = true;
    void fetch(`/api/leaderboard/top?metric=${m}`, { cache: 'no-store' })
      .then(async (r) => (r.ok ? ((await r.json()) as { top: LeaderboardEntry[] }) : null))
      .then((d) => {
        pendingRef.current = false;
        if (d && d.top.length > 0) setFullTops((f) => ({ ...f, [m]: d.top }));
        setMetric(m); // 실패해도 전환 — 20행 미리보기가 폴백
      })
      .catch(() => {
        pendingRef.current = false;
        setMetric(m);
      });
  };
  const { top: baseTop, mine } = payloads[metric];
  const top = fullTops[metric] ?? baseTop;

  return (
    <>
      <BoardHeader metric={metric} mine={mine} />
      <div className="space-y-4 px-4 pb-4">
      <LeaderboardTabs active={metric} onChange={switchMetric} />

      {top.length === 0 ? (
        <section className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-10 text-center text-sm text-zinc-400">
          아직 랭킹에 오른 유저가 없어요.
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
                    <Link
                      prefetch={false}
                      key={entry.userId}
                      href={profileHref(entry.publicCode, serverId)}
                      className={`flex min-w-0 flex-1 flex-col items-center self-stretch ${
                        first ? 'z-10' : ''
                      }`}
                    >
                      <div className="flex w-full items-center justify-center gap-0.5 px-0.5 pt-1">
                        <span className="text-pixel-outline font-mono text-[11px] font-bold leading-none text-amber-300 tabular-nums">
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
                            <GuildBadge
                              emblemUrl={entry.guildEmblemUrl ?? null}
                              size={11}
                              className="shrink-0"
                            />
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
                      <Link
                        prefetch={false}
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
                              loading="lazy"
                              decoding="async"
                              alt=""
                              aria-hidden
                              className="h-full w-full object-contain"
                              style={{ imageRendering: 'pixelated' }}
                            />
                          ) : null}
                        </span>
                        {/* 닉네임(위) + 길드명·문양(아래) */}
                        <span className="flex min-w-0 flex-1 flex-col justify-center">
                          <span className="truncate text-sm font-medium text-white">
                            {e.nickname}
                          </span>
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

          {/* 내 순위 줄 — Top 100 밖이면 목록에 내가 없어 "몇 등인지"를 알 수 없다. 목록 맨 아래에
              일반 행으로 둔다(스크롤 끝에서 확인). 이전엔 sticky bottom으로 붙였는데 채팅 미니바가
              그 자리를 덮어 보이지 않았다(2026-09-02). 목록 안에 있으면 하이라이트가 이미 있으므로
              중복을 피해 내보내지 않는다(2026-08-02). */}
          {mine && !top.some((e) => e.userId === userId) ? (
            <section className="mt-2 flex items-center gap-2.5 rounded-xl border border-amber-500/60 bg-zinc-950 px-3 py-2.5">
              <span className="w-7 shrink-0 text-center font-mono text-sm font-bold text-amber-300 tabular-nums">
                #{mine.rank}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-white">나</span>
              <span className="font-mono text-sm font-bold text-amber-200 tabular-nums">
                {fmt(mine.value)}
              </span>
            </section>
          ) : null}
        </>
      )}
      </div>
    </>
  );
}
