'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { useResourceToast } from '@/components/ResourceToast';
import { useDiamond } from '@/components/DiamondContext';
import {
  GUILD_DONATIONS_PER_DAY,
  GUILD_DONATION_TIERS,
  GUILD_EMBLEM_REROLL_COST_DIAMOND,
} from '@/lib/game/guild/balance';
import type { EmblemSelection } from '@/lib/game/guild/emblem-vocab';

import {
  donateAction,
  leaveGuildAction,
  disbandGuildAction,
  distributeTaxAction,
  rerollEmblemAction,
} from './actions';
import { EmblemPicker, DEFAULT_EMBLEM } from './EmblemPicker';
import { guildErrMsg } from './errors-msg';

type Member = {
  userId: string;
  role: 'leader' | 'vice' | 'member';
  nickname: string;
  contributionPoints: number;
};
type GuildView = {
  name: string;
  level: number;
  notice: string | null;
  memberCount: number;
  capacity: number;
  taxPool: string;
  emblemUrl: string | null;
  emblemColor: string | null;
};

const ROLE_BADGE: Record<Member['role'], { label: string; cls: string } | null> = {
  leader: { label: '길드장', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' },
  vice: { label: '부길드장', cls: 'bg-sky-500/15 text-sky-700 dark:text-sky-300' },
  member: null,
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
  members: Member[];
  myUserId: string;
  myRole: Member['role'];
  usedToday: number;
  residence: string | null;
}) {
  const router = useRouter();
  const { showHeaderToast, showError } = useResourceToast();
  const { optimisticAdjust } = useDiamond();
  const [pending, start] = useTransition();
  const [rerollOpen, setRerollOpen] = useState(false);
  const [emblem, setEmblem] = useState<EmblemSelection>(DEFAULT_EMBLEM);

  const nextTier = usedToday < GUILD_DONATIONS_PER_DAY ? GUILD_DONATION_TIERS[usedToday]! : null;

  const reroll = () => {
    start(async () => {
      const r = await rerollEmblemAction(emblem);
      if (r.status !== 'success') return showError(guildErrMsg(r.code));
      optimisticAdjust(BigInt(-GUILD_EMBLEM_REROLL_COST_DIAMOND));
      showHeaderToast({ title: '문양 재생성 완료' });
      setRerollOpen(false);
      router.refresh();
    });
  };

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

  const disband = () => {
    if (!confirm('길드를 해산할까요? 되돌릴 수 없습니다.')) return;
    start(async () => {
      const r = await disbandGuildAction();
      if (r.status !== 'success') return showError(guildErrMsg(r.code));
      showHeaderToast({ title: '길드 해산됨' });
      router.refresh();
    });
  };

  const distribute = () => {
    start(async () => {
      const r = await distributeTaxAction('equal');
      if (r.status !== 'success') return showError(guildErrMsg(r.code));
      if (r.perMember) optimisticAdjust(BigInt(r.perMember)); // 본인 몫 즉시 반영
      showHeaderToast({ title: `세금 균등 분배 (총 ${r.total}💎)` });
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      {/* 정보 */}
      <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center gap-3">
          {/* 문양(없으면 톤색 폴백 방패) */}
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
              <span className="shrink-0 text-xs text-zinc-500">Lv.{guild.level}</span>
            </div>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              멤버 {guild.memberCount}/{guild.capacity} · 거주 {residence ?? '미배정'}
            </p>
            {myRole === 'leader' && (
              <button
                type="button"
                onClick={() => setRerollOpen(true)}
                className="mt-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400"
              >
                문양 재생성 ({GUILD_EMBLEM_REROLL_COST_DIAMOND.toLocaleString('ko-KR')}💎)
              </button>
            )}
          </div>
        </div>
        {guild.notice && (
          <p className="mt-2 rounded-lg bg-zinc-100 px-3 py-2 text-[12px] text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
            {guild.notice}
          </p>
        )}
      </section>

      {/* 기부 */}
      <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold">길드 기부</h3>
            <p className="text-[11px] text-zinc-500">
              오늘 {usedToday}/{GUILD_DONATIONS_PER_DAY}
              {nextTier ? ` · 다음 ${nextTier.cost === 0 ? '무료' : `${nextTier.cost}💎`} → +${nextTier.xp} XP` : ' · 완료'}
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

      {/* 세금 풀 (길드장 분배) */}
      {myRole === 'leader' && (
        <section className="flex items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <div>
            <h3 className="text-sm font-bold">길드 세금 풀</h3>
            <p className="text-[11px] text-zinc-500">{guild.taxPool}💎 누적</p>
          </div>
          <button
            type="button"
            onClick={distribute}
            disabled={pending}
            className="shrink-0 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            균등 분배
          </button>
        </section>
      )}

      {/* 멤버 */}
      <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h3 className="text-sm font-bold">길드원 ({members.length})</h3>
        <ul className="mt-2 space-y-1.5">
          {members.map((m) => {
            const badge = ROLE_BADGE[m.role];
            return (
              <li key={m.userId} className="flex items-center justify-between gap-2 text-[13px]">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className={`truncate font-semibold ${m.userId === myUserId ? 'text-amber-700 dark:text-amber-300' : ''}`}>
                    {m.nickname}
                  </span>
                  {badge && (
                    <span className={`shrink-0 rounded-full px-1.5 py-0 text-[9px] font-bold ${badge.cls}`}>
                      {badge.label}
                    </span>
                  )}
                </div>
                <span className="shrink-0 font-mono text-[11px] tabular-nums text-zinc-500">
                  {m.contributionPoints.toLocaleString('ko-KR')} 기여
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {/* 탈퇴 / 해산 */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={leave}
          disabled={pending}
          className="flex-1 rounded-lg border border-zinc-300 py-2.5 text-sm font-semibold text-zinc-600 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-400"
        >
          탈퇴
        </button>
        {myRole === 'leader' && (
          <button
            type="button"
            onClick={disband}
            disabled={pending}
            className="flex-1 rounded-lg border border-red-300 py-2.5 text-sm font-semibold text-red-600 disabled:opacity-50 dark:border-red-900/60 dark:text-red-400"
          >
            해산
          </button>
        )}
      </div>

      {/* 문양 재생성 모달(길드장) */}
      {rerollOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3"
          onClick={() => setRerollOpen(false)}
        >
          <div
            className="max-h-[85vh] w-full max-w-[390px] overflow-y-auto rounded-2xl bg-white p-4 dark:bg-zinc-950"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-bold">문양 재생성</h2>
              <button type="button" onClick={() => setRerollOpen(false)} className="text-xs text-zinc-500">
                닫기
              </button>
            </div>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              비용 {GUILD_EMBLEM_REROLL_COST_DIAMOND.toLocaleString('ko-KR')}💎 · 생성 실패 시 환불
            </p>
            <div className="mt-3">
              <EmblemPicker value={emblem} onChange={setEmblem} disabled={pending} />
            </div>
            <button
              type="button"
              onClick={reroll}
              disabled={pending}
              className="mt-3 w-full rounded-lg bg-amber-600 py-2.5 text-sm font-bold text-white disabled:opacity-50"
            >
              {pending ? '생성 중…' : '재생성'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
