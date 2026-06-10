'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { useResourceToast } from '@/components/ResourceToast';
import { useDiamond } from '@/components/DiamondContext';
import {
  GUILD_DONATIONS_PER_DAY,
  GUILD_DONATION_TIERS,
  guildXpToNext,
} from '@/lib/game/guild/balance';

import { donateAction, leaveGuildAction } from './actions';
import { guildErrMsg } from './errors-msg';
import { GuildMemberList, type RichMember } from './GuildMemberList';

type GuildRole = 'leader' | 'vice' | 'member';
type GuildView = {
  name: string;
  level: number;
  xp: number;
  notice: string | null;
  memberCount: number;
  capacity: number;
  emblemUrl: string | null;
  emblemColor: string | null;
};

export function GuildHome({
  guild,
  members,
  myUserId,
  myRole,
  usedToday,
}: {
  guild: GuildView;
  members: RichMember[];
  myUserId: string;
  myRole: GuildRole;
  usedToday: number;
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
  const isOfficer = myRole === 'leader' || myRole === 'vice';
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

  const donateLabel = !nextTier
    ? '완료'
    : confirm
      ? `💎${nextTier.cost} ${confirmLeft}s` // 컨펌 오버레이 — 비용 + 남은 초
      : nextTier.cost === 0
        ? '기부'
        : `기부 ${nextTier.cost}💎`;

  return (
    <div className="space-y-3">
      {/* 길드 정보 + 기부 */}
      <section className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
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
          {/* 관리 버튼 — 길드 관리(임원만) / 점령지 관리(전원, 임원만 편집). 같은 크기. */}
          <div className="flex shrink-0 flex-col gap-1">
            {isOfficer && (
              <Link
                href="/guild/settings"
                className="flex w-[82px] items-center justify-center gap-1 rounded-md bg-zinc-100 px-1.5 py-1 text-[10px] font-bold text-zinc-700 active:opacity-70 dark:bg-zinc-800 dark:text-zinc-200"
              >
                ⚙️ 길드 관리
              </Link>
            )}
            <Link
              href="/guild/deploy"
              className="flex w-[82px] items-center justify-center gap-1 rounded-md bg-zinc-100 px-1.5 py-1 text-[10px] font-bold text-zinc-700 active:opacity-70 dark:bg-zinc-800 dark:text-zinc-200"
            >
              점령지 관리
            </Link>
          </div>
        </div>

        {guild.notice && (
          <p className="mt-2 rounded-lg bg-zinc-100 px-3 py-2 text-[12px] text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
            {guild.notice}
          </p>
        )}

        {/* 길드 경험치바 + 컴팩트 기부 버튼 */}
        <div className="mt-2.5 flex items-center gap-2.5 border-t border-zinc-200 pt-2.5 dark:border-zinc-800">
          <div className="min-w-0 flex-1">
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
          </div>
          <button
            type="button"
            onClick={onDonate}
            disabled={pending || !nextTier}
            className={`relative isolate flex w-[82px] shrink-0 items-center justify-center overflow-hidden rounded-lg py-1 text-[11px] font-bold transition-colors ${
              !nextTier
                ? 'bg-zinc-200 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-600'
                : confirm
                  ? 'bg-amber-700 text-white'
                  : 'bg-amber-600 text-white'
            }`}
          >
            {confirm ? (
              <span
                aria-hidden
                className="absolute inset-0 bg-amber-500"
                style={{ animation: 'confirm-bg-pulse 1.2s ease-in-out infinite' }}
              />
            ) : null}
            <span className="relative">{donateLabel}</span>
          </button>
        </div>
      </section>


      {/* 길드원 명단(아바타·장비·정렬 메트릭, 클릭 시 프로필) */}
      <GuildMemberList members={members} myUserId={myUserId} />

      {/* 탈퇴 — 보더 없이 빨강 텍스트, 컨펌은 팝업 */}
      <button
        type="button"
        onClick={() => setLeaveOpen(true)}
        disabled={pending}
        className="w-full rounded-lg py-2.5 text-sm font-semibold text-red-600 disabled:opacity-50 dark:text-red-400"
      >
        길드 탈퇴
      </button>

      {/* 탈퇴 확인 팝업 */}
      {leaveOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-5 backdrop-blur-sm"
          onClick={() => setLeaveOpen(false)}
        >
          <div
            className="w-full max-w-[300px] rounded-2xl bg-white p-5 dark:bg-zinc-950"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-bold">길드 탈퇴</h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-500 dark:text-zinc-400">
              정말 길드를 탈퇴할까요?
              <br />
              탈퇴 후 24시간 동안 재가입할 수 없습니다.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setLeaveOpen(false)}
                className="flex-1 rounded-lg bg-zinc-100 py-2.5 text-sm font-bold text-zinc-700 active:opacity-70 dark:bg-zinc-800 dark:text-zinc-200"
              >
                취소
              </button>
              <button
                type="button"
                onClick={leave}
                disabled={pending}
                className="flex-1 rounded-lg bg-red-600 py-2.5 text-sm font-bold text-white active:opacity-90 disabled:opacity-50"
              >
                탈퇴
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
