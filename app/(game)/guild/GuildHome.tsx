'use client';

import { useEffect, useRef, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { useResourceToast } from '@/components/ResourceToast';
import { useDiamond } from '@/components/DiamondContext';
import { GUILD_DONATIONS_PER_DAY, GUILD_DONATION_TIERS } from '@/lib/game/guild/balance';

import { donateAction, leaveGuildAction } from './actions';
import { guildErrMsg } from './errors-msg';
import { GuildMemberList, type RichMember } from './GuildMemberList';

type GuildRole = 'leader' | 'vice' | 'member';
type GuildView = {
  name: string;
  level: number;
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
  residence,
}: {
  guild: GuildView;
  members: RichMember[];
  myUserId: string;
  myRole: GuildRole;
  usedToday: number;
  residence: string | null;
}) {
  const router = useRouter();
  const { showHeaderToast, showError } = useResourceToast();
  const { optimisticAdjust } = useDiamond();
  const [pending, start] = useTransition();
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

  const donate = () => {
    if (!nextTier) return;
    start(async () => {
      const r = await donateAction();
      if (r.status !== 'success') return showError(guildErrMsg(r.code));
      if (r.cost > 0) optimisticAdjust(BigInt(-r.cost));
      showHeaderToast({ title: `기부 완료 +${r.xp} XP` });
      router.refresh();
    });
  };

  const leave = () => {
    if (!confirm('길드를 탈퇴할까요? (24시간 재가입 불가)')) return;
    start(async () => {
      const r = await leaveGuildAction();
      if (r.status !== 'success') return showError(guildErrMsg(r.code));
      showHeaderToast({ title: r.disbanded ? '길드 해산됨' : '길드 탈퇴' });
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      {/* 길드 정보 + 기부 */}
      <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center gap-3">
          <div
            className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl"
            style={{ backgroundColor: guild.emblemColor ?? '#3f3f46' }}
          >
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
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-xs text-zinc-500">Lv.{guild.level}</span>
                {isOfficer && (
                  <Link
                    href="/guild/settings"
                    aria-label="길드 설정"
                    className="rounded-full border border-zinc-300 px-2 py-0.5 text-[11px] font-semibold text-zinc-500 dark:border-zinc-700"
                  >
                    설정
                  </Link>
                )}
              </div>
            </div>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              멤버 {guild.memberCount}/{guild.capacity} · 거주 {residence ?? '미배정'}
            </p>
          </div>
        </div>

        {guild.notice && (
          <p className="mt-2 rounded-lg bg-zinc-100 px-3 py-2 text-[12px] text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
            {guild.notice}
          </p>
        )}

        {/* 기부 — 길드 정보란 내 */}
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
          <div>
            <span className="text-[13px] font-bold">길드 기부</span>
            <p className="text-[11px] text-zinc-500">
              오늘 {usedToday}/{GUILD_DONATIONS_PER_DAY}
              {nextTier
                ? ` · 다음 ${nextTier.cost === 0 ? '무료' : `${nextTier.cost}💎`} → +${nextTier.xp} XP`
                : ' · 완료'}
            </p>
          </div>
          <button
            type="button"
            onClick={donate}
            disabled={pending || !nextTier}
            className="shrink-0 rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            {nextTier ? '기부' : '완료'}
          </button>
        </div>
      </section>

      {/* 점령전 배치 진입 */}
      <Link
        href="/guild/deploy"
        className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950"
      >
        <div>
          <span className="text-sm font-bold">점령전 배치</span>
          <p className="text-[11px] text-zinc-500">
            {isOfficer ? '길드원 공격/수비 지정' : '우리 길드 배치 현황'}
          </p>
        </div>
        <span className="text-zinc-400">→</span>
      </Link>

      {/* 길드원 명단(아바타·장비·전투력/강화/기여도 정렬) */}
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
