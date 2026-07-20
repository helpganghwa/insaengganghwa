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

import { assetUrl } from '@/lib/asset-versions';
import type { GuildLogEntry } from '@/lib/game/guild/activity-log';

import { donateAction, leaveGuildAction } from './actions';
import { guildErrMsg } from './errors-msg';
import { type RichMember } from './GuildMemberList';
import { GuildLogFeed } from './GuildLogFeed';

// 길드 홈 메뉴 그리드(홈 패턴) — 각 타일 클릭 시 상세로 이동. 길드 관리는 임원만 노출.
// 배경 스프라이트: /sprites/guild-menu/{key}.png (없으면 tint 단색으로 graceful).
const GUILD_MENU = [
  { key: 'members', href: '/guild/members', label: '길드원', desc: '멤버 명단·전투력', tint: '#1c2238', officerOnly: false },
  { key: 'deploy', href: '/guild/deploy', label: '점령지', desc: '점령지 배치·관리', tint: '#2a2012', officerOnly: false },
  { key: 'settings', href: '/guild/settings', label: '길드 관리', desc: '공지·가입·임원', tint: '#3a1419', officerOnly: true },
  { key: 'ranking', href: '/guild/ranking', label: '길드 랭킹', desc: '서버 길드 순위', tint: '#143a2a', officerOnly: false },
] as const;

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
};

export function GuildHome({
  guild,
  members,
  log,
  myRole,
  usedToday,
  leaderHandover,
}: {
  guild: GuildView;
  members: RichMember[];
  log: GuildLogEntry[];
  myRole: GuildRole;
  usedToday: number;
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
  // 권한별 표시 타일(길드 관리=임원만). 전부 가로 꽉 찬 와이드 배너로 세로 나열.
  const visibleMenu = GUILD_MENU.filter((m) => !m.officerOnly || isOfficer);
  const effectiveUsed = usedToday + optDonations;
  const nextTier =
    effectiveUsed < GUILD_DONATIONS_PER_DAY ? (GUILD_DONATION_TIERS[effectiveUsed] ?? null) : null;
  const displayXp = guild.xp + optXp;

  // 결성 직후 문양은 after()로 비동기 생성(~수초) → 폴백 표시 중이면 1회 자동 새로고침해 픽업.
  const emblemPolledRef = useRef(false);
  useEffect(() => {
    if (guild.emblemUrl || emblemPolledRef.current) return;
    const t = setTimeout(() => {
      emblemPolledRef.current = true;
      router.refresh();
    }, 4000);
    return () => clearTimeout(t);
  }, [guild.emblemUrl, router]);

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
          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl">
            {guild.emblemUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={guild.emblemUrl}
                alt="길드 문양"
                className="h-full w-full object-contain"
                style={{ imageRendering: 'pixelated' }}
              />
            ) : (
              <span className="text-2xl">🛡️</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-bold">{guild.name}</h2>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              멤버 {guild.memberCount}/{guild.capacity}
            </p>
          </div>
          {/* 오픈채팅 — 설정 시 상단 정보에 그대로 노출(외부 링크). 나머지 메뉴는 하단 그리드로 이동. */}
          {guild.openchatUrl && (
            <a
              href={guild.openchatUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-[82px] shrink-0 items-center justify-center gap-1 rounded-md bg-[#FEE500] px-1.5 py-1.5 text-[10px] font-bold text-black/85 active:opacity-70"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/kakao/kakao_symbol.png" alt="" aria-hidden className="h-3 w-auto" />
              오픈채팅
            </a>
          )}
        </div>

        {guild.notice && (
          <div className="mt-2 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 dark:bg-amber-500/10">
            <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300">
              공지
            </span>
            <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-[12px] leading-relaxed text-zinc-700 dark:text-zinc-200">
              {guild.notice}
            </p>
          </div>
        )}

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
            <div className="relative z-10 bg-gradient-to-t from-black/90 via-black/55 to-transparent px-0.5 pb-[20%] pt-6 text-center">
              <div className="break-keep text-[13px] font-extrabold leading-tight tracking-tight text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)]">
                {m.label}
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
              label={mustTransfer ? '길드장 위임 필요' : '길드 탈퇴'}
              className="w-full max-w-[300px] rounded-2xl bg-white p-5 dark:bg-zinc-950"
            >
                <h2 className="text-base font-bold">{mustTransfer ? '길드장 위임 필요' : '길드 탈퇴'}</h2>
                <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-500 dark:text-zinc-400">
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
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setLeaveOpen(false)}
                    className="flex-1 rounded-lg bg-zinc-100 py-2.5 text-sm font-bold text-zinc-700 active:opacity-70 dark:bg-zinc-800 dark:text-zinc-200"
                  >
                    {mustTransfer ? '닫기' : '취소'}
                  </button>
                  {mustTransfer ? (
                    <Link prefetch={false}
                      href="/guild/settings"
                      onClick={() => setLeaveOpen(false)}
                      className="flex-1 rounded-lg bg-amber-600 py-2.5 text-center text-sm font-bold text-white active:opacity-90"
                    >
                      길드장 위임
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={leave}
                      disabled={pending}
                      className="flex-1 rounded-lg bg-red-600 py-2.5 text-sm font-bold text-white active:opacity-90 disabled:opacity-50"
                    >
                      {leaderDisband ? '해산' : '탈퇴'}
                    </button>
                  )}
                </div>
            </ModalShell>
          );
        })()}
    </div>
  );
}
