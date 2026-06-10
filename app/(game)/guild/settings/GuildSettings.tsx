'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { useResourceToast } from '@/components/ResourceToast';
import { useDiamond } from '@/components/DiamondContext';
import {
  GUILD_EMBLEM_REROLL_COST_DIAMOND,
  MAX_GUILD_EMBLEMS,
  type GuildJoinPolicy,
} from '@/lib/game/guild/balance';
import type { EmblemSelection } from '@/lib/game/guild/emblem-vocab';

import {
  generateEmblemAction,
  setActiveEmblemAction,
  deleteEmblemAction,
  distributeTaxAction,
  setJoinPolicyAction,
  approveJoinAction,
  rejectJoinAction,
  disbandGuildAction,
  setViceAction,
  kickMemberAction,
  transferLeadershipAction,
} from '../actions';
import { EmblemPicker, DEFAULT_EMBLEM } from '../EmblemPicker';
import { guildErrMsg } from '../errors-msg';

type Role = 'leader' | 'vice' | 'member';
type JoinRequest = { userId: string; nickname: string };
type MemberLite = { userId: string; nickname: string; role: Role };
type SettingsView = {
  taxPool: string;
  joinPolicy: GuildJoinPolicy;
  emblemUrl: string | null;
  emblemColor: string | null;
};
type EmblemItem = { id: string; emblemUrl: string | null; emblemColor: string | null; isActive: boolean };

export function GuildSettings({
  guild,
  emblems,
  joinRequests,
  members,
  myUserId,
  myRole,
}: {
  guild: SettingsView;
  emblems: EmblemItem[];
  joinRequests: JoinRequest[];
  members: MemberLite[];
  myUserId: string;
  myRole: Role;
}) {
  const router = useRouter();
  const { showHeaderToast, showError } = useResourceToast();
  const { optimisticAdjust } = useDiamond();
  const [pending, start] = useTransition();
  const [genOpen, setGenOpen] = useState(false);
  const [genPending, setGenPending] = useState(false); // 낙관적 '생성 중' 슬롯
  const [delConfirm, setDelConfirm] = useState<string | null>(null);
  const [emblem, setEmblem] = useState<EmblemSelection>(DEFAULT_EMBLEM);
  const isLeader = myRole === 'leader';

  const setVice = (userId: string, makeVice: boolean) =>
    start(async () => {
      const r = await setViceAction(userId, makeVice);
      if (r.status !== 'success') return showError(guildErrMsg(r.code));
      showHeaderToast({ title: makeVice ? '부길드장 임명' : '부길드장 해제' });
      router.refresh();
    });

  const kick = (userId: string, nickname: string) => {
    if (!confirm(`${nickname}님을 추방할까요? (24시간 재가입 불가)`)) return;
    start(async () => {
      const r = await kickMemberAction(userId);
      if (r.status !== 'success') return showError(guildErrMsg(r.code));
      showHeaderToast({ title: '추방 완료' });
      router.refresh();
    });
  };

  const transfer = (userId: string, nickname: string) => {
    if (!confirm(`${nickname}님에게 길드장을 위임할까요? 되돌릴 수 없습니다.`)) return;
    start(async () => {
      const r = await transferLeadershipAction(userId);
      if (r.status !== 'success') return showError(guildErrMsg(r.code));
      showHeaderToast({ title: '길드장 위임 완료' });
      router.refresh();
    });
  };

  const manageable = members.filter((m) => m.userId !== myUserId && m.role !== 'leader');

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

  // 생성 — 낙관적: '생성 중' 슬롯 즉시 표시 + 다이아 선차감, 실패 시 롤백.
  const generate = () => {
    setGenOpen(false);
    setGenPending(true);
    optimisticAdjust(BigInt(-GUILD_EMBLEM_REROLL_COST_DIAMOND));
    start(async () => {
      const r = await generateEmblemAction(emblem);
      setGenPending(false);
      if (r.status !== 'success') {
        optimisticAdjust(BigInt(GUILD_EMBLEM_REROLL_COST_DIAMOND));
        return showError(guildErrMsg(r.code));
      }
      showHeaderToast({ title: '문양 생성 완료' });
      router.refresh();
    });
  };

  const selectEmblem = (id: string) =>
    start(async () => {
      const r = await setActiveEmblemAction(id);
      if (r.status !== 'success') return showError(guildErrMsg(r.code));
      router.refresh();
    });

  // 삭제 — 1차 탭=확인 대기(3s), 2차 탭=실행.
  const removeEmblem = (id: string) => {
    if (delConfirm !== id) {
      setDelConfirm(id);
      setTimeout(() => setDelConfirm((c) => (c === id ? null : c)), 3000);
      return;
    }
    setDelConfirm(null);
    start(async () => {
      const r = await deleteEmblemAction(id);
      if (r.status !== 'success') return showError(guildErrMsg(r.code));
      showHeaderToast({ title: '문양 삭제됨' });
      router.refresh();
    });
  };

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
    <div className="space-y-3 px-3 py-3">
      <h1 className="text-base font-bold">길드 관리</h1>

      {/* 구성원 관리 */}
      <section className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
        <h3 className="text-sm font-bold">구성원 관리</h3>
        <p className="mt-0.5 text-[11px] text-zinc-500">
          {isLeader ? '부길드장 임명·추방·길드장 위임' : '길드원 추방'}
        </p>
        {manageable.length === 0 ? (
          <p className="mt-3 text-[12px] text-zinc-400">관리할 구성원이 없습니다.</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {manageable.map((m) => (
              <li key={m.userId} className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate text-[13px] font-semibold">{m.nickname}</span>
                  {m.role === 'vice' && (
                    <span className="shrink-0 rounded-full bg-sky-500/15 px-1.5 py-0 text-[9px] font-bold text-sky-700 dark:text-sky-300">
                      부길드장
                    </span>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {isLeader &&
                    (m.role === 'vice' ? (
                      <button
                        type="button"
                        onClick={() => setVice(m.userId, false)}
                        disabled={pending}
                        className="rounded-md border border-zinc-300 px-2 py-1 text-[10px] font-semibold text-zinc-600 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300"
                      >
                        부길드장 해제
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setVice(m.userId, true)}
                        disabled={pending}
                        className="rounded-md border border-sky-300 px-2 py-1 text-[10px] font-semibold text-sky-600 disabled:opacity-50 dark:border-sky-800 dark:text-sky-400"
                      >
                        부길드장 임명
                      </button>
                    ))}
                  {isLeader && (
                    <button
                      type="button"
                      onClick={() => transfer(m.userId, m.nickname)}
                      disabled={pending}
                      className="rounded-md border border-amber-300 px-2 py-1 text-[10px] font-semibold text-amber-600 disabled:opacity-50 dark:border-amber-800 dark:text-amber-400"
                    >
                      위임
                    </button>
                  )}
                  {/* 부길드장은 일반 멤버만 추방 가능 */}
                  {(isLeader || m.role === 'member') && (
                    <button
                      type="button"
                      onClick={() => kick(m.userId, m.nickname)}
                      disabled={pending}
                      className="rounded-md border border-red-300 px-2 py-1 text-[10px] font-semibold text-red-500 disabled:opacity-50 dark:border-red-900/60"
                    >
                      추방
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 가입 방식 + 신청 */}
      <section className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
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
        <section className="flex items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
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

      {/* 길드 문양 보관함 (길드장) — 최대 3개 보관, 1개 선택 사용. */}
      {isLeader && (
        <section className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="mb-2 flex items-baseline justify-between">
            <h3 className="text-sm font-bold">
              길드 문양{' '}
              <span className="text-[11px] font-medium text-zinc-400">
                {emblems.length + (genPending ? 1 : 0)}/{MAX_GUILD_EMBLEMS}
              </span>
            </h3>
            <p className="text-[11px] text-zinc-500">
              생성 {GUILD_EMBLEM_REROLL_COST_DIAMOND.toLocaleString('ko-KR')}💎 · 선택/삭제 무료
            </p>
          </div>
          <div className="flex flex-wrap gap-2.5">
            {emblems.map((e) => {
              const confirming = delConfirm === e.id;
              return (
                <div key={e.id} className="relative">
                  <button
                    type="button"
                    onClick={() => !e.isActive && selectEmblem(e.id)}
                    disabled={pending}
                    aria-label={e.isActive ? '사용 중 문양' : '이 문양 사용'}
                    className={`flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl border-2 bg-zinc-50 transition disabled:opacity-60 dark:bg-zinc-900 ${
                      e.isActive
                        ? 'border-amber-500 ring-2 ring-amber-500/30'
                        : 'border-zinc-200 active:scale-95 dark:border-zinc-700'
                    }`}
                  >
                    {e.emblemUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={e.emblemUrl}
                        alt=""
                        aria-hidden
                        className="h-full w-full object-contain"
                        style={{ imageRendering: 'pixelated' }}
                      />
                    ) : null}
                  </button>
                  {e.isActive && (
                    <span className="absolute -left-1 -top-1 rounded-full bg-amber-500 px-1.5 py-px text-[9px] font-bold text-white shadow">
                      사용
                    </span>
                  )}
                  {emblems.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeEmblem(e.id)}
                      disabled={pending}
                      aria-label="문양 삭제"
                      className={`absolute -right-1.5 -top-1.5 flex h-5 items-center justify-center rounded-full text-[10px] font-bold text-white shadow transition ${
                        confirming ? 'w-auto bg-red-600 px-1.5' : 'w-5 bg-zinc-700/90'
                      }`}
                    >
                      {confirming ? '삭제?' : '×'}
                    </button>
                  )}
                </div>
              );
            })}

            {/* 낙관적 '생성 중' 슬롯 */}
            {genPending && (
              <div className="flex h-16 w-16 items-center justify-center rounded-xl border-2 border-dashed border-amber-400 bg-amber-50 dark:bg-amber-950/30">
                <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">생성 중…</span>
              </div>
            )}

            {/* 새 문양 생성 슬롯 (3개 미만일 때) */}
            {emblems.length + (genPending ? 1 : 0) < MAX_GUILD_EMBLEMS && (
              <button
                type="button"
                onClick={() => setGenOpen(true)}
                disabled={pending}
                className="flex h-16 w-16 flex-col items-center justify-center gap-0.5 rounded-xl border-2 border-dashed border-zinc-300 text-zinc-400 transition active:scale-95 disabled:opacity-50 dark:border-zinc-700"
              >
                <span className="text-xl leading-none">+</span>
                <span className="text-[9px] font-semibold">생성</span>
              </button>
            )}
          </div>
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

      {/* 새 문양 생성 모달 */}
      {genOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3"
          onClick={() => setGenOpen(false)}
        >
          <div
            className="max-h-[85vh] w-full max-w-[390px] overflow-y-auto rounded-2xl bg-white p-4 dark:bg-zinc-950"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-bold">새 문양 생성</h2>
              <button type="button" onClick={() => setGenOpen(false)} className="text-xs text-zinc-500">
                닫기
              </button>
            </div>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              비용 {GUILD_EMBLEM_REROLL_COST_DIAMOND.toLocaleString('ko-KR')}💎 · 생성 실패 시 환불 · 보관 후 선택해 사용
            </p>
            <div className="mt-3">
              <EmblemPicker value={emblem} onChange={setEmblem} disabled={pending} />
            </div>
            <button
              type="button"
              onClick={generate}
              disabled={pending}
              className="mt-3 w-full rounded-lg bg-amber-600 py-2.5 text-sm font-bold text-white disabled:opacity-50"
            >
              생성
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
