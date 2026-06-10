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
  const isOfficer = myRole === 'leader' || myRole === 'vice';
  const nextTier = usedToday < GUILD_DONATIONS_PER_DAY ? GUILD_DONATION_TIERS[usedToday]! : null;

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

  // 유료 기부 인-버튼 3초 컨펌(만료 자동 해제).
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

  const runDonate = () =>
    start(async () => {
      const r = await donateAction();
      if (r.status !== 'success') return showError(guildErrMsg(r.code));
      if (r.cost > 0) optimisticAdjust(BigInt(-r.cost));
      showHeaderToast({ title: `기부 완료 +${r.xp} XP` });
      router.refresh();
    });

  const onDonate = () => {
    if (pending || !nextTier) return;
    if (nextTier.cost === 0) return runDonate(); // 1회차 무료 — 즉시
    if (!confirm) {
      setConfirmLeft(3);
      setConfirm(true);
      return;
    }
    setConfirm(false);
    runDonate();
  };

  const leave = () => {
    if (!window.confirm('길드를 탈퇴할까요? (24시간 재가입 불가)')) return;
    start(async () => {
      const r = await leaveGuildAction();
      if (r.status !== 'success') return showError(guildErrMsg(r.code));
      showHeaderToast({ title: r.disbanded ? '길드 해산됨' : '길드 탈퇴' });
      router.refresh();
    });
  };

  const donateLabel = pending
    ? '기부중'
    : !nextTier
      ? '완료'
      : confirm
        ? `한번더 ${confirmLeft}s`
        : nextTier.cost === 0
          ? '기부'
          : `기부 ${nextTier.cost}💎`;

  return (
    <div className="space-y-4">
      {/* 길드 정보 + 기부 */}
      <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center gap-3">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl">
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
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="truncate text-base font-bold">{guild.name}</h2>
              <span className="shrink-0 text-xs text-zinc-500">Lv.{guild.level}</span>
            </div>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              멤버 {guild.memberCount}/{guild.capacity}
            </p>
          </div>
        </div>

        {guild.notice && (
          <p className="mt-2 rounded-lg bg-zinc-100 px-3 py-2 text-[12px] text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
            {guild.notice}
          </p>
        )}

        {/* 길드 경험치바 + 컴팩트 기부 버튼 */}
        <div className="mt-3 flex items-center gap-2.5 border-t border-zinc-200 pt-3 dark:border-zinc-800">
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between text-[10px] text-zinc-500">
              <span className="font-semibold">길드 경험치</span>
              <span className="font-mono tabular-nums">
                {guild.xp.toLocaleString('ko-KR')}/{guildXpToNext(guild.level).toLocaleString('ko-KR')}
              </span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
              <div
                className="h-full rounded-full bg-amber-500"
                style={{ width: `${Math.min(100, (guild.xp / guildXpToNext(guild.level)) * 100)}%` }}
              />
            </div>
          </div>
          <button
            type="button"
            onClick={onDonate}
            disabled={pending || !nextTier}
            className={`relative isolate flex w-[84px] shrink-0 items-center justify-center overflow-hidden rounded-lg py-1.5 text-[12px] font-bold transition-colors ${
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

      {/* 길드 관리(임원, 정보 영역과 분리) */}
      {isOfficer && (
        <Link
          href="/guild/settings"
          className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950"
        >
          <span className="text-sm font-bold">길드 관리</span>
          <span className="text-zinc-400">→</span>
        </Link>
      )}

      {/* 길드원 명단(아바타·장비·정렬 메트릭, 클릭 시 프로필) */}
      <GuildMemberList members={members} myUserId={myUserId} />

      {/* 탈퇴 */}
      <button
        type="button"
        onClick={leave}
        disabled={pending}
        className="w-full rounded-lg border border-zinc-300 py-2.5 text-sm font-semibold text-zinc-600 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-400"
      >
        길드 탈퇴
      </button>
    </div>
  );
}
