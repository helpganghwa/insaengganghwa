'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { useResourceToast } from '@/components/ResourceToast';
import { useDiamond } from '@/components/DiamondContext';
import {
  GUILD_EMBLEM_REROLL_COST_DIAMOND,
  type GuildJoinPolicy,
} from '@/lib/game/guild/balance';
import type { EmblemSelection } from '@/lib/game/guild/emblem-vocab';

import {
  rerollEmblemAction,
  distributeTaxAction,
  setJoinPolicyAction,
  approveJoinAction,
  rejectJoinAction,
  disbandGuildAction,
} from '../actions';
import { EmblemPicker, DEFAULT_EMBLEM } from '../EmblemPicker';
import { guildErrMsg } from '../errors-msg';

type JoinRequest = { userId: string; nickname: string };
type SettingsView = {
  taxPool: string;
  joinPolicy: GuildJoinPolicy;
  emblemUrl: string | null;
  emblemColor: string | null;
};

export function GuildSettings({
  guild,
  joinRequests,
  myRole,
}: {
  guild: SettingsView;
  joinRequests: JoinRequest[];
  myRole: 'leader' | 'vice' | 'member';
}) {
  const router = useRouter();
  const { showHeaderToast, showError } = useResourceToast();
  const { optimisticAdjust } = useDiamond();
  const [pending, start] = useTransition();
  const [rerollOpen, setRerollOpen] = useState(false);
  const [emblem, setEmblem] = useState<EmblemSelection>(DEFAULT_EMBLEM);
  const isLeader = myRole === 'leader';

  const changePolicy = (policy: GuildJoinPolicy) => {
    if (policy === guild.joinPolicy) return;
    start(async () => {
      const r = await setJoinPolicyAction(policy);
      if (r.status !== 'success') return showError(guildErrMsg(r.code));
      showHeaderToast({ title: policy === 'open' ? '자유 가입으로 변경' : '승인 가입으로 변경' });
      router.refresh();
    });
  };

  const approve = (userId: string) =>
    start(async () => {
      const r = await approveJoinAction(userId);
      if (r.status !== 'success') return showError(guildErrMsg(r.code));
      showHeaderToast({ title: '가입 승인' });
      router.refresh();
    });

  const reject = (userId: string) =>
    start(async () => {
      const r = await rejectJoinAction(userId);
      if (r.status !== 'success') return showError(guildErrMsg(r.code));
      showHeaderToast({ title: '가입 거절' });
      router.refresh();
    });

  const reroll = () =>
    start(async () => {
      const r = await rerollEmblemAction(emblem);
      if (r.status !== 'success') return showError(guildErrMsg(r.code));
      optimisticAdjust(BigInt(-GUILD_EMBLEM_REROLL_COST_DIAMOND));
      showHeaderToast({ title: '문양 재생성 완료' });
      setRerollOpen(false);
      router.refresh();
    });

  const distribute = () =>
    start(async () => {
      const r = await distributeTaxAction('equal');
      if (r.status !== 'success') return showError(guildErrMsg(r.code));
      if (r.perMember) optimisticAdjust(BigInt(r.perMember));
      showHeaderToast({ title: `세금 균등 분배 (총 ${r.total}💎)` });
      router.refresh();
    });

  const disband = () => {
    if (!confirm('길드를 해산할까요? 되돌릴 수 없습니다.')) return;
    start(async () => {
      const r = await disbandGuildAction();
      if (r.status !== 'success') return showError(guildErrMsg(r.code));
      showHeaderToast({ title: '길드 해산됨' });
      router.replace('/guild');
    });
  };

  return (
    <div className="space-y-4 px-4 py-4">
      <h1 className="text-base font-bold">길드 설정</h1>

      {/* 가입 방식 + 신청 */}
      <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold">가입 방식</h3>
          <div className="flex gap-1 rounded-lg bg-zinc-100 p-0.5 dark:bg-zinc-900">
            {(
              [
                ['open', '자유'],
                ['approval', '승인'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => changePolicy(key)}
                disabled={pending}
                className={`rounded-md px-3 py-1 text-[12px] font-bold transition disabled:opacity-50 ${
                  guild.joinPolicy === key
                    ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-950 dark:text-zinc-50'
                    : 'text-zinc-500'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-1 text-[11px] text-zinc-500">
          {guild.joinPolicy === 'open'
            ? '신청 즉시 가입됩니다.'
            : '신청을 길드장·부길드장이 승인해야 가입됩니다.'}
        </p>

        {guild.joinPolicy === 'approval' && (
          <div className="mt-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
            <p className="text-[11px] font-semibold text-zinc-500">가입 신청 ({joinRequests.length})</p>
            {joinRequests.length === 0 ? (
              <p className="mt-1.5 text-[11px] text-zinc-400">대기 중인 신청이 없습니다.</p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {joinRequests.map((r) => (
                  <li key={r.userId} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-[13px] font-semibold">{r.nickname}</span>
                    <div className="flex shrink-0 gap-1.5">
                      <button
                        type="button"
                        onClick={() => approve(r.userId)}
                        disabled={pending}
                        className="rounded-full bg-amber-600 px-3 py-1 text-[11px] font-bold text-white disabled:opacity-50"
                      >
                        승인
                      </button>
                      <button
                        type="button"
                        onClick={() => reject(r.userId)}
                        disabled={pending}
                        className="rounded-full border border-zinc-300 px-3 py-1 text-[11px] font-semibold text-zinc-500 disabled:opacity-50 dark:border-zinc-700"
                      >
                        거절
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      {/* 세금 풀 분배 (길드장) */}
      {isLeader && (
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

      {/* 문양 재생성 (길드장) */}
      {isLeader && (
        <section className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg"
              style={{ backgroundColor: guild.emblemColor ?? '#3f3f46' }}
            >
              {guild.emblemUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={guild.emblemUrl} alt="" aria-hidden className="h-full w-full object-contain" style={{ imageRendering: 'pixelated' }} />
              ) : null}
            </div>
            <div>
              <h3 className="text-sm font-bold">길드 문양</h3>
              <p className="text-[11px] text-zinc-500">
                재생성 {GUILD_EMBLEM_REROLL_COST_DIAMOND.toLocaleString('ko-KR')}💎
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setRerollOpen(true)}
            className="shrink-0 rounded-lg border border-amber-400 px-3 py-2 text-sm font-bold text-amber-600 dark:border-amber-700 dark:text-amber-400"
          >
            재생성
          </button>
        </section>
      )}

      {/* 해산 (길드장) */}
      {isLeader && (
        <button
          type="button"
          onClick={disband}
          disabled={pending}
          className="w-full rounded-lg border border-red-300 py-2.5 text-sm font-semibold text-red-600 disabled:opacity-50 dark:border-red-900/60 dark:text-red-400"
        >
          길드 해산
        </button>
      )}

      {/* 문양 재생성 모달 */}
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
