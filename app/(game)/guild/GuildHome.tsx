'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { useResourceToast } from '@/components/ResourceToast';
import { useDiamond } from '@/components/DiamondContext';
import {
  GUILD_REJOIN_LOCK_HOURS,
  GUILD_DONATIONS_PER_DAY,
  GUILD_DONATION_TIERS,
  guildXpToNext,
} from '@/lib/game/guild/balance';

import { ModalShell } from '@/components/ModalShell';
import { ModalLayout, ModalButton } from '@/components/ModalLayout';

import { assetUrl } from '@/lib/asset-versions';
import type { GuildLogEntry } from '@/lib/game/guild/activity-log';

import { donateAction, leaveGuildAction } from './actions';
import { guildErrMsg } from './errors-msg';
import { type RichMember } from './GuildMemberList';
import { GuildLogFeed } from './GuildLogFeed';
import { GuildNoticeBlock, GuildOpenchatButton } from './GuildInfoBlocks';

// 길드 홈 메뉴 그리드(홈 패턴) — 각 타일 클릭 시 상세로 이동. 길드 관리는 임원만 노출.
// 배경 스프라이트: /sprites/guild-menu/{key}.png (없으면 tint 단색으로 graceful).
const GUILD_MENU = [
  { key: 'members', href: '/guild/members', label: '길드원', tint: '#1c2238', officerOnly: false },
  { key: 'deploy', href: '/guild/deploy', label: '점령지', tint: '#2a2012', officerOnly: false },
  { key: 'settings', href: '/guild/settings', label: '길드 관리', tint: '#3a1419', officerOnly: true },
  { key: 'ranking', href: '/guild/ranking', label: '길드 랭킹', tint: '#143a2a', officerOnly: false },
] as const;

/** 깃발 아래 작은 수치 — 들어가 보지 않고도 상태를 알게 한다(2026-07-30). */
export type GuildMenuStats = {
  /** 보유 구역 수. */
  zoneCount: number;
  /** 전투력 랭킹(1부터). 순위 밖이면 null. */
  powerRank: number | null;
  /** 처리 대기 가입 신청 — 임원에게만 배지로. 0이면 미표시. */
  joinRequestCount: number;
};

type GuildRole = 'leader' | 'vice' | 'member';
type GuildView = {
  name: string;
  level: number;
  xp: number;
  notice: string | null;
  openchatUrl: string | null;
  memberCount: number;
  capacity: number;
  emblemUrl: string | null;
  emblemColor: string | null;
  /** 문양 생성 상태(0150) — 'pending' 생성 중 · 'failed' 실패 · 'done' 완료. */
  emblemStatus: string;
  /** 생성 시작 시각(ms) — 굳은 pending 판정용. null=시작 기록 없음. */
  emblemPendingAt: number | null;
  /** 자동 재시도(12회) 소진 — 조합을 바꿔야 풀린다. */
  emblemExhausted: boolean;
};

export function GuildHome({
  guild,
  members,
  log,
  myRole,
  usedToday,
  leaderHandover,
  menuStats,
}: {
  guild: GuildView;
  members: RichMember[];
  log: GuildLogEntry[];
  myRole: GuildRole;
  usedToday: number;
  /** 깃발 수치·배지 — 서버가 계산해 넘긴다. */
  menuStats: GuildMenuStats;
  /** 길드장 위임 위험 — inactiveDays(서버 계산)>=warnDays면 배너. null=접속 기록 없음. */
  leaderHandover: { inactiveDays: number | null; warnDays: number; handoverDays: number };
}) {
  const router = useRouter();
  const { showHeaderToast, showError } = useResourceToast();
  const { optimisticAdjust } = useDiamond();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const [confirmLeft, setConfirmLeft] = useState(0);
  const [leaveOpen, setLeaveOpen] = useState(false);
  // 기부 낙관적 상태 — 즉시 반영('기부중' 미노출), 실패 시 롤백.
  const [optDonations, setOptDonations] = useState(0);
  const [optXp, setOptXp] = useState(0);
  // 서버 usedToday가 revalidate로 따라잡히면 낙관값 리셋(이중 카운트 방지). effect/ref 아닌
  // 렌더 중 state 조정(React 권장 패턴) — usedToday 0→1 그 렌더에서 opt=0으로 맞춰 깜빡임 없음.
  const [prevUsed, setPrevUsed] = useState(usedToday);
  if (prevUsed !== usedToday) {
    setPrevUsed(usedToday);
    setOptDonations(0);
    setOptXp(0);
  }
  const isOfficer = myRole === 'leader' || myRole === 'vice';
  // 문양 생성 권한 — 서버(라우트)가 정본으로 재검증하지만, 권한 없는 유저에게 무의미한
  // 킥·버튼을 노출하지 않기 위한 화면 가드. 부길드장의 세부 권한은 서버가 최종 판정한다.
  const canEmblem = isOfficer;
  // 권한별 표시 타일(길드 관리=임원만). 전부 가로 꽉 찬 와이드 배너로 세로 나열.
  const visibleMenu = GUILD_MENU.filter((m) => !m.officerOnly || isOfficer);
  /** 깃발 아래 한 줄 — 수치가 없는 항목은 빈 문자열(줄만 비운다). */
  const menuDesc = (key: string): string => {
    if (key === 'members') return `${guild.memberCount} / ${guild.capacity}`;
    if (key === 'deploy') return `${menuStats.zoneCount}곳 보유`;
    if (key === 'ranking') return menuStats.powerRank ? `전투력 ${menuStats.powerRank}위` : '순위 밖';
    if (key === 'settings') return '가입 · 권한 · 세금';
    return '';
  };
  const effectiveUsed = usedToday + optDonations;
  const nextTier =
    effectiveUsed < GUILD_DONATIONS_PER_DAY ? (GUILD_DONATION_TIERS[effectiveUsed] ?? null) : null;
  const displayXp = guild.xp + optXp;

  // 결성 직후 문양은 after()로 비동기 생성 → 완성될 때까지 폴링해 픽업한다.
  // 이전엔 4초 뒤 1회뿐이라 실제 소요(10~40초)를 못 따라가 거의 항상 헛방이었다(2026-08-06).
  // 시작한 지 4분 넘은 pending은 굳은 것으로 본다(함수가 잘려 catch가 못 돈 경우).
  // 생성 예산(150초)보다 넉넉히 잡아야 정상 생성 중에 '실패'로 뒤집히지 않는다.
  const emblemStale =
    guild.emblemStatus === 'pending' &&
    guild.emblemPendingAt !== null &&
    Date.now() - guild.emblemPendingAt > 240_000;

  // 생성 경과 초 — '만드는 중'이 멈춘 것처럼 보이지 않게 진행을 숫자로 보여준다(2026-08-06).
  // Date.now()를 렌더에서 읽으면 하이드레이션이 어긋나므로 effect에서만 읽는다.
  const [emblemElapsed, setEmblemElapsed] = useState<number | null>(null);

  // 폴링 횟수를 state로 둔다 — ref는 렌더를 안 깨워 '소진 후 실패 표시'로 못 넘어간다.
  const [emblemPolls, setEmblemPolls] = useState(0);
  // 재시도 직후 낙관 표시 — 서버 상태(revalidate)가 돌아오기 전에도 즉시 '만드는 중'.
  const [retryOptimistic, setRetryOptimistic] = useState(false);
  const MAX_EMBLEM_POLLS = 24; // 5초 × 24 = 2분
  useEffect(() => {
    if (guild.emblemUrl) return;
    if (guild.emblemStatus !== 'pending' && !retryOptimistic) return;
    if (emblemStale && !retryOptimistic) return; // 굳은 pending은 폴링해도 안 바뀐다
    if (emblemPolls >= MAX_EMBLEM_POLLS) return;
    const t = setTimeout(() => {
      setEmblemPolls((n) => n + 1);
      // 경량 상태 폴링(2026-08-06) — 이전엔 5초마다 router.refresh()로 /guild 전체(6쿼리)
      // +layout(7쿼리)을 재렌더했다. 상태 라우트(1쿼리)만 찍고, 확정됐을 때 풀 refresh 1회.
      void fetch('/api/guild/emblem/status', { cache: 'no-store' })
        .then(async (r) => (r.ok ? ((await r.json()) as { url: string | null; status: string }) : null))
        .then((s) => {
          if (s && (s.url || s.status === 'failed')) router.refresh();
        })
        .catch(() => {
          /* 네트워크 실패 — 다음 틱 재시도 */
        });
    }, 5000);
    return () => clearTimeout(t);
  }, [guild.emblemUrl, guild.emblemStatus, emblemStale, retryOptimistic, emblemPolls, router]);

  // 서버가 결과를 확정하면(문양 생김·failed 전환) 낙관 플래그를 내린다.
  useEffect(() => {
    if (guild.emblemUrl || guild.emblemStatus === 'failed') setRetryOptimistic(false);
  }, [guild.emblemUrl, guild.emblemStatus]);

  // 생성 중 표시는 폴링이 남아 있는 동안만 — 소진되면(예: 함수가 잘려 pending이 굳음)
  // 스켈레톤에 갇히지 않고 실패 표시로 내려 다시 시도할 수 있게 한다.
  const emblemPollsLeft = emblemPolls < MAX_EMBLEM_POLLS;
  const emblemPending =
    !guild.emblemUrl &&
    (retryOptimistic || (guild.emblemStatus === 'pending' && !emblemStale)) &&
    emblemPollsLeft;
  // status가 done인데 문양이 없는 경우(선택값 없는 레거시 길드 등)는 실패가 아니다 —
  // 재시도할 원본이 없어 버튼이 죽은 링크가 된다. 조용히 기본 방패만 보여준다.
  const emblemFailed = !guild.emblemUrl && !emblemPending && guild.emblemStatus !== 'done';

  // 수동 재시도 — 실패 상태에서만 노출. 성공하면 서버 액션의 revalidate로 문양이 바로 붙는다.
  useEffect(() => {
    if (guild.emblemUrl || guild.emblemStatus !== 'pending') {
      setEmblemElapsed(null);
      return;
    }
    const base = guild.emblemPendingAt ?? Date.now();
    const tick = () => setEmblemElapsed(Math.max(0, Math.round((Date.now() - base) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [guild.emblemUrl, guild.emblemStatus, guild.emblemPendingAt]);

  /**
   * 문양 생성 킥 — 전용 라우트(180초 예산)를 fetch로 쏜다. 서버 액션이 아니라 fetch인 이유:
   * 액션은 직렬 처리라 20~97초짜리 생성이 라우터 내비게이션을 막는다(무한 로딩 제보).
   * 응답을 기다리는 동안에도 화면은 폴링으로 갱신되고, 유저는 자유롭게 이동할 수 있다.
   * 중복 발사는 서버의 생성 클레임이 막으므로 여기서는 낙관적으로 쏜다.
   */
  const kickEmblem = () => {
    setRetryOptimistic(true); // 즉시 '만드는 중'으로
    setEmblemPolls(0);
    void fetch('/api/guild/emblem/generate', { method: 'POST' })
      .then((r) => {
        if (!r.ok && r.status !== 429) showError('문양 만들기에 실패했어요. 다시 시도해 주세요.');
        router.refresh();
      })
      .catch(() => {
        /* 네트워크 실패는 폴링·크론이 커버 — 화면은 그대로 '만드는 중' */
      });
  };

  // 결성 직후·굳은 pending 진입 시 자동 킥 — 결성 액션은 상태만 찍고 생성은 이 라우트가 한다.
  const kickedRef = useRef(false);
  useEffect(() => {
    if (kickedRef.current || guild.emblemUrl) return;
    if (guild.emblemStatus !== 'pending' || !canEmblem) return;
    kickedRef.current = true;
    kickEmblem();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guild.emblemUrl, guild.emblemStatus, canEmblem]);

  // 유료 기부 인-버튼 3초 컨펌(만료 자동 해제) — 남은 초(3s/2s/1s)를 라벨에 표기.
  useEffect(() => {
    if (!confirm) return;
    const id = setInterval(() => {
      setConfirmLeft((s) => {
        if (s <= 1) {
          setConfirm(false);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [confirm]);

  // 낙관적 기부 — 경험치바·다이아·단계를 즉시 반영하고 서버는 백그라운드 처리. 실패 시 롤백.
  const runDonate = (tier: { cost: number; xp: number }) => {
    setOptDonations((n) => n + 1);
    setOptXp((x) => x + tier.xp);
    if (tier.cost > 0) optimisticAdjust(BigInt(-tier.cost));
    showHeaderToast({ title: `기부 완료 +${tier.xp} XP` });
    start(async () => {
      const r = await donateAction();
      if (r.status !== 'success') {
        setOptDonations((n) => Math.max(0, n - 1));
        setOptXp((x) => Math.max(0, x - tier.xp));
        if (tier.cost > 0) optimisticAdjust(BigInt(tier.cost));
        showError(guildErrMsg(r.code));
      }
    });
  };

  const onDonate = () => {
    if (pending || !nextTier) return;
    if (nextTier.cost === 0) return runDonate(nextTier); // 1회차 무료 — 즉시
    if (!confirm) {
      setConfirmLeft(3);
      setConfirm(true);
      return;
    }
    setConfirm(false);
    runDonate(nextTier);
  };

  const leave = () => {
    setLeaveOpen(false);
    start(async () => {
      const r = await leaveGuildAction();
      if (r.status !== 'success') return showError(guildErrMsg(r.code));
      showHeaderToast({ title: r.disbanded ? '길드 해산됨' : '길드 탈퇴' });
      router.refresh();
    });
  };


  const lhDays = leaderHandover.inactiveDays;
  const showHandoverWarn = lhDays != null && lhDays >= leaderHandover.warnDays;
  const handoverImminent = lhDays != null && lhDays >= leaderHandover.handoverDays;

  return (
    <div className="space-y-3">
      {/* 길드장 위임 위험 배너 — 미접속 경고일↑(투명성: 전 길드원 노출) */}
      {showHandoverWarn && (
        <div
          className={`rounded-xl border p-3 text-[12px] ${
            handoverImminent
              ? 'border-red-300 bg-red-50 text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300'
              : 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300'
          }`}
        >
          <p className="font-bold">⚠ 길드장 {lhDays}일째 미접속</p>
          <p className="mt-0.5 leading-relaxed">
            {handoverImminent
              ? '자동 위임 대상입니다 — 곧 활성 길드원(부길드장 우선) 중 기여도 1위에게 길드장이 위임됩니다.'
              : `${leaderHandover.handoverDays}일 미접속 시 활성 길드원에게 길드장이 자동 위임됩니다.`}
          </p>
        </div>
      )}

      {/* 길드 정보(하단 플랫) + 그 밑에 바로 붙는 깃발 메뉴 — 한 묶음 */}
      <div>
      <section className="rounded-t-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center gap-2.5">
          {/* 문양 슬롯 — 상태를 슬롯 자체로 드러낸다(B안 확정 2026-08-06):
              생성 중=스켈레톤 · 실패=점선 테두리 · 완료=문양. 슬롯 크기(48px)는 세 상태 동일. */}
          <div
            className={`relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl ${
              emblemFailed ? 'border border-dashed border-orange-500/55 bg-orange-500/[0.07]' : ''
            } ${emblemPending ? 'animate-pulse bg-zinc-200 dark:bg-zinc-800' : ''}`}
          >
            {guild.emblemUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={guild.emblemUrl}
                alt="길드 문양"
                className="h-full w-full object-contain"
                style={{ imageRendering: 'pixelated' }}
              />
            ) : emblemPending ? null : (
              <span className="text-2xl opacity-60">🛡️</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-bold">{guild.name}</h2>
            {/* 메타 한 줄 — 생성 중·완료·실패가 모두 같은 높이를 쓰도록 멤버 수는 항상 남기고
                문양 상태만 뒤에 덧붙인다(상태마다 줄 수가 달라 레이아웃이 튀던 문제, 2026-08-06). */}
            <div className="mt-0.5 flex min-w-0 items-center gap-1 text-[11px] text-zinc-500">
              <span className="shrink-0">
                멤버 {guild.memberCount}/{guild.capacity}
              </span>
              {emblemPending && (
                <>
                  <span className="shrink-0 text-zinc-400 dark:text-zinc-600">·</span>
                  <span className="truncate">
                    문양 만드는 중…
                    {emblemElapsed !== null && <span className="ml-1 tabular-nums">{emblemElapsed}초</span>}
                  </span>
                </>
              )}
              {emblemFailed && (
                <>
                  <span className="shrink-0 text-zinc-400 dark:text-zinc-600">·</span>
                  {guild.emblemExhausted ? (
                    <>
                      <span className="shrink-0 text-orange-500">조합 변경 필요</span>
                      <Link
                        href="/guild/emblem"
                        className="shrink-0 rounded-md bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-zinc-900"
                      >
                        고르러 가기
                      </Link>
                    </>
                  ) : (
                    <>
                      <span className="shrink-0 text-orange-500">문양 실패</span>
                      <button
                        type="button"
                        onClick={kickEmblem}
                        className="shrink-0 rounded-md border border-zinc-300 px-1.5 py-0.5 text-[10px] font-bold text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
                      >
                        다시 만들기
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
          {/* 오픈채팅 — 설정 시 상단 정보에 그대로 노출(외부 링크). 나머지 메뉴는 하단 그리드로 이동. */}
          <GuildOpenchatButton url={guild.openchatUrl} />
        </div>

        {guild.notice ? (
          <div className="mt-2">
            <GuildNoticeBlock notice={guild.notice} />
          </div>
        ) : null}

        {/* 길드 경험치바 */}
        <div className="mt-2.5 border-t border-zinc-200 pt-2.5 dark:border-zinc-800">
          <div className="flex items-baseline justify-between text-[10px] text-zinc-500">
            <span className="font-bold text-zinc-700 dark:text-zinc-300">Lv.{guild.level}</span>
            <span className="font-mono tabular-nums">
              {displayXp.toLocaleString('ko-KR')}/{guildXpToNext(guild.level).toLocaleString('ko-KR')}
            </span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
            <div
              className="h-full rounded-full bg-emerald-500 transition-[width] duration-300"
              style={{ width: `${Math.min(100, (displayXp / guildXpToNext(guild.level)) * 100)}%` }}
            />
          </div>

          {/* 단계별 기부 버튼(3개 동일 크기) — 이전 단계 완료해야 다음 활성(나머지 disabled),
              다이아 단계는 클릭 시 3초 인-버튼 컨펌 후 재클릭으로 기부. */}
          <div className="mt-2.5 grid grid-cols-3 gap-1.5">
            {GUILD_DONATION_TIERS.map((t, i) => {
              const done = i < effectiveUsed;
              const isNext = i === effectiveUsed;
              const costLabel = t.cost === 0 ? '무료' : `${t.cost}💎`;
              const label = done
                ? '완료'
                : isNext && confirm
                  ? `${i + 1}단계 ${costLabel} ${confirmLeft}s`
                  : `${i + 1}단계 ${costLabel}`;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={isNext ? onDonate : undefined}
                  disabled={!isNext || pending}
                  className={`relative isolate flex items-center justify-center overflow-hidden rounded-lg py-1.5 text-[11px] font-bold transition-colors ${
                    done
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                      : isNext
                        ? confirm
                          ? 'bg-amber-700 text-white'
                          : 'bg-amber-600 text-white'
                        : 'bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-600'
                  }`}
                >
                  {isNext && confirm ? (
                    <span
                      aria-hidden
                      className="absolute inset-0 bg-amber-500"
                      style={{ animation: 'confirm-bg-pulse 1.2s ease-in-out infinite' }}
                    />
                  ) : null}
                  <span className="relative">{label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* 깃발 메뉴 — 정보 카드 하단(플랫)에 바로 붙어 매달린 4칸(제비꼬리 클립). 봉/고리 없음.
          길드 관리(임원)만 빠지면 멤버는 3깃발 → 비어도 자연스러움. */}
      <div className="grid grid-cols-4 gap-2">
        {visibleMenu.map((m) => (
          <Link prefetch={false}
            key={m.href}
            href={m.href}
            style={{
              backgroundColor: m.tint,
              clipPath: 'polygon(0 0, 100% 0, 100% 86%, 50% 100%, 0 86%)',
            }}
            className="relative flex aspect-[5/8] w-full flex-col justify-end isolate overflow-hidden transition active:scale-[0.97]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={assetUrl(`/sprites/guild-menu/${m.key}.png`)}
              alt=""
              aria-hidden
              draggable={false}
              className="absolute inset-0 h-full w-full object-cover"
              style={{ imageRendering: 'pixelated' }}
            />
            {/* 임원만 보는 대기 배지 — 가입 신청이 쌓여도 모르던 문제(2026-07-30). */}
            {m.key === 'settings' && menuStats.joinRequestCount > 0 ? (
              <span
                aria-label={`가입 신청 ${menuStats.joinRequestCount}건`}
                className="absolute right-0.5 top-0.5 z-20 inline-flex min-w-[16px] items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-bold leading-[1.6] tabular-nums text-white ring-2 ring-zinc-900/60"
              >
                {menuStats.joinRequestCount > 99 ? '99+' : menuStats.joinRequestCount}
              </span>
            ) : null}
            <div className="relative z-10 bg-gradient-to-t from-black/90 via-black/55 to-transparent px-0.5 pb-[18%] pt-6 text-center">
              <div className="break-keep text-[13px] font-extrabold leading-tight tracking-tight text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)]">
                {m.label}
              </div>
              <div className="mt-0.5 break-keep text-[9px] font-semibold leading-tight tabular-nums text-white/75 drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]">
                {menuDesc(m.key)}
              </div>
            </div>
          </Link>
        ))}
      </div>
      </div>

      {/* 길드 로그 — 미리보기 10건. 전체(100건)는 /guild/log 상세(월드 로그와 동일 패턴). */}
      <section className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-sm font-bold">길드 로그</h3>
          <Link prefetch={false} href="/guild/log" className="text-[11px] font-semibold text-zinc-500 hover:underline">
            전체 보기 ›
          </Link>
        </div>
        <GuildLogFeed entries={log} />
      </section>

      {/* 탈퇴 — 보더 없이 빨강 텍스트, 컨펌은 팝업 */}
      <button
        type="button"
        onClick={() => setLeaveOpen(true)}
        disabled={pending}
        className="w-full rounded-lg py-2.5 text-sm font-semibold text-red-600 disabled:opacity-50 dark:text-red-400"
      >
        길드 탈퇴
      </button>

      {/* 탈퇴 확인 팝업 — 길드장+멤버 잔존 시 위임 안내, 길드장 단독 시 해산 안내. */}
      {leaveOpen &&
        (() => {
          const mustTransfer = myRole === 'leader' && members.length > 1;
          const leaderDisband = myRole === 'leader' && members.length <= 1;
          return (
            <ModalShell
              onClose={() => setLeaveOpen(false)}
              onSubmit={mustTransfer ? undefined : () => !pending && leave()}
              label={mustTransfer ? '길드장 위임 필요' : '길드 탈퇴'}
            >
              <ModalLayout
                title={mustTransfer ? '길드장 위임 필요' : leaderDisband ? '길드 해산' : '길드 탈퇴'}
                subtitle={
                  mustTransfer ? null : (
                    <span className="font-bold text-red-500">
                      {GUILD_REJOIN_LOCK_HOURS}시간 재가입 불가
                    </span>
                  )
                }
                footer={
                  <>
                    <ModalButton tone="neutral" onClick={() => setLeaveOpen(false)}>
                      {mustTransfer ? '닫기' : '취소'}
                    </ModalButton>
                    {mustTransfer ? (
                      <Link
                        prefetch={false}
                        href="/guild/settings"
                        onClick={() => setLeaveOpen(false)}
                        className="flex-1 rounded-xl bg-amber-600 py-2.5 text-center text-[13px] font-bold text-white active:opacity-90"
                      >
                        길드장 위임
                      </Link>
                    ) : (
                      <ModalButton tone="danger" onClick={leave} disabled={pending}>
                        {leaderDisband ? '해산' : '탈퇴'}
                      </ModalButton>
                    )}
                  </>
                }
              >
                <p className="text-[13px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                  {mustTransfer ? (
                    <>
                      길드장은 바로 탈퇴할 수 없어요.
                      <br />
                      다른 길드원에게 길드장을 위임한 뒤 탈퇴할 수 있습니다.
                    </>
                  ) : leaderDisband ? (
                    <>
                      길드원이 없어 탈퇴 시 길드가 해산됩니다.
                      <br />
                      탈퇴 후 {GUILD_REJOIN_LOCK_HOURS}시간 동안 재가입할 수 없습니다.
                    </>
                  ) : (
                    <>
                      정말 길드를 탈퇴할까요?
                      <br />
                      탈퇴 후 {GUILD_REJOIN_LOCK_HOURS}시간 동안 재가입할 수 없습니다.
                    </>
                  )}
                </p>
              </ModalLayout>
            </ModalShell>
          );
        })()}
    </div>
  );
}
