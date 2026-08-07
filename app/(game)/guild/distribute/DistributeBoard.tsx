'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { useResourceToast } from '@/components/ResourceToast';
import { useDiamondActions } from '@/components/DiamondContext';
import { ModalShell } from '@/components/ModalShell';
import { ModalLayout, ModalButton } from '@/components/ModalLayout';
import { ZoomSafeInput } from '@/components/ui/ZoomSafeField';

import { distributeTaxManualAction } from '../actions';
import { guildErrMsg } from '../errors-msg';

type Role = 'leader' | 'vice' | 'member';
export type DistributeMember = {
  userId: string;
  nickname: string;
  role: Role;
  /** 누적 기여도(= 길드 XP 기여). */
  contribution: number;
  /** 오늘(KST) 기부로 얻은 기여 — 분배 판단의 실제 기준(문의 #91). */
  todayDonation: number;
};

const ROLE_BADGE: Record<Role, { label: string; cls: string } | null> = {
  leader: { label: '길드장', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' },
  vice: { label: '부길드장', cls: 'bg-sky-500/15 text-sky-700 dark:text-sky-300' },
  member: null,
};

/** 배분 방식 — 고르면 전원 금액이 자동으로 채워진다. */
type Mode = 'equal' | 'contribution' | 'today' | 'manual';
const MODES: { key: Mode; label: string }[] = [
  { key: 'equal', label: '균등' },
  { key: 'contribution', label: '기여 비례' },
  { key: 'today', label: '오늘 기부자' },
  { key: 'manual', label: '직접' },
];

/**
 * 세금 분배(T1-a 확정안) — 방식을 고르면 금액이 채워지고, 목록에서 **바로 숫자 입력**.
 *
 * 종전 화면의 문제:
 *  - 길드원 전원(최대 50명)에게 입력란이 하나씩 — 대부분 0으로 남는다.
 *  - 배분 방식이 '균등' 하나뿐인데, 실제로 하는 일은 "기여한 사람에게 비례해서"다.
 *  - 판단 기준인 기여도·오늘 기부액이 이 화면에 없어 구성원 화면과 왕복해야 했다(문의 #91).
 *
 * 그래서 방식 4종 + 행에 기여/오늘 기부 표시 + 기여 0인 인원은 한 줄로 접는다.
 * 금액은 별도 조정 화면으로 내려가지 않고 그 자리에서 고친다(inputMode="numeric").
 */
export function DistributeBoard({
  myUserId,
  pool: poolStr,
  members,
}: {
  myUserId: string;
  pool: string;
  members: DistributeMember[];
}) {
  const router = useRouter();
  const { showHeaderToast, showError } = useResourceToast();
  const { optimisticAdjust } = useDiamondActions();
  const [pending, start] = useTransition();
  const pool = Number(poolStr);

  const [mode, setMode] = useState<Mode>('contribution');
  /** 사용자가 직접 고친 금액만 담는다 — 방식이 준 값과 구분해 재계산 시 유지. */
  const [override, setOverride] = useState<Record<string, number>>({});
  const [expandZero, setExpandZero] = useState(false);
  const [payAsk, setPayAsk] = useState(false);

  /** 방식별 기본 배분 — override가 있으면 그 값이 이긴다. */
  const amounts = useMemo(() => {
    const base: Record<string, number> = {};
    if (mode === 'equal' && members.length > 0) {
      const per = Math.floor(pool / members.length);
      for (const m of members) base[m.userId] = Math.max(0, per);
    } else if (mode === 'contribution') {
      const total = members.reduce((n, m) => n + m.contribution, 0);
      if (total > 0) {
        for (const m of members) base[m.userId] = Math.floor((pool * m.contribution) / total);
      }
    } else if (mode === 'today') {
      const total = members.reduce((n, m) => n + m.todayDonation, 0);
      if (total > 0) {
        for (const m of members) base[m.userId] = Math.floor((pool * m.todayDonation) / total);
      }
    }
    // manual = 전부 0에서 시작. override는 항상 위에 얹는다.
    return { ...base, ...override };
  }, [mode, members, pool, override]);

  const amtOf = (userId: string) => amounts[userId] ?? 0;
  const total = members.reduce((n, m) => n + amtOf(m.userId), 0);
  const remaining = pool - total;
  const over = total > pool;

  /** 분배 대상(금액 > 0) + 기여가 있는 사람은 항상 노출 — 나머지는 접는다.
   * Set 판정(2026-08-07 렌더 감사) — 종전 `!shown.includes(m)`는 O(n²)라 대형 길드에서
   * 금액 키 입력마다(리렌더마다) 인원² 비교가 돌았다. */
  const { shown, hidden } = useMemo(() => {
    const s = members.filter(
      (m) => (amounts[m.userId] ?? 0) > 0 || m.contribution > 0 || m.userId in override,
    );
    const set = new Set(s.map((m) => m.userId));
    return { shown: s, hidden: members.filter((m) => !set.has(m.userId)) };
  }, [members, amounts, override]);
  const visible = expandZero ? members : shown;

  const setAmt = (userId: string, raw: string) => {
    const n = Math.max(0, Math.floor(Number(raw.replace(/[^0-9]/g, '')) || 0));
    setOverride((o) => ({ ...o, [userId]: n }));
  };

  /** 남은 전액을 이 사람에게 몰아준다 — 비례 계산의 나머지를 터는 용도. */
  const giveRest = (userId: string) => {
    const rest = Math.max(0, remaining) + amtOf(userId);
    setOverride((o) => ({ ...o, [userId]: rest }));
  };

  const changeMode = (next: Mode) => {
    setMode(next);
    setOverride({}); // 방식을 바꾸면 손댄 값도 초기화 — 섞이면 결과를 설명할 수 없다.
  };

  const payload = members
    .map((m) => ({ userId: m.userId, amount: amtOf(m.userId) }))
    .filter((x) => x.amount > 0);
  const canPay = total > 0 && !over && !pending;

  const pay = () => {
    if (!canPay) return;
    setPayAsk(false);
    const mine = payload.find((p) => p.userId === myUserId)?.amount ?? 0;
    if (mine > 0) optimisticAdjust(BigInt(mine));
    start(async () => {
      const r = await distributeTaxManualAction(payload).catch(() => null);
      if (!r || r.status !== 'success') {
        if (mine > 0) optimisticAdjust(BigInt(-mine));
        showError(r?.code ? guildErrMsg(r.code) : '전송에 실패했어요. 다시 시도해 주세요.');
        return;
      }
      showHeaderToast({ title: `${payload.length}명에게 분배 완료` });
      setOverride({});
      router.refresh();
    });
  };

  return (
    <section className="mt-3">
      {/* 분배 가능 세금 */}
      <div className="rounded-xl border border-amber-500/40 bg-amber-50/50 px-3 py-2.5 dark:border-amber-500/30 dark:bg-amber-500/[0.06]">
        <p className="text-[10px] font-bold tracking-wide text-zinc-400">분배 가능 세금</p>
        <p className="text-xl font-extrabold tabular-nums text-amber-600 dark:text-amber-400">
          💎{pool.toLocaleString('ko-KR')}
        </p>
      </div>

      {/* 배분 방식 — 고르면 금액이 자동으로 채워진다. */}
      <div className="mt-2.5 flex gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-900">
        {MODES.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => changeMode(m.key)}
            disabled={pending}
            className={`flex-1 rounded-lg py-1.5 text-[11.5px] font-bold transition disabled:opacity-50 ${
              mode === m.key
                ? 'bg-white text-amber-600 shadow-sm dark:bg-zinc-950 dark:text-amber-400'
                : 'text-zinc-500'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* 분배 목록 — 금액을 그 자리에서 입력. */}
      <ul className="mt-2 rounded-xl border border-zinc-200 bg-white px-3 dark:border-zinc-800 dark:bg-zinc-950">
        {visible.map((m) => {
          const badge = ROLE_BADGE[m.role];
          const amt = amtOf(m.userId);
          return (
            <li
              key={m.userId}
              className="flex items-center gap-2 border-b border-zinc-100 py-2 last:border-b-0 dark:border-zinc-900"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-[12.5px] font-semibold">{m.nickname}</span>
                  {badge ? (
                    <span className={`shrink-0 rounded-full px-1.5 py-0 text-[9px] font-bold ${badge.cls}`}>
                      {badge.label}
                    </span>
                  ) : null}
                  {m.userId === myUserId ? (
                    <span className="shrink-0 text-[9px] font-bold text-zinc-400">나</span>
                  ) : null}
                </div>
                <div className="mt-0.5 text-[10.5px] text-zinc-500">
                  기여{' '}
                  <b className="tabular-nums text-zinc-700 dark:text-zinc-300">
                    {m.contribution.toLocaleString('ko-KR')}
                  </b>
                  {' · '}
                  {m.todayDonation > 0 ? (
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                      오늘 {m.todayDonation.toLocaleString('ko-KR')}
                    </span>
                  ) : (
                    <span className="text-zinc-400">오늘 미기부</span>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <span className="text-[11px] text-zinc-400">💎</span>
                <ZoomSafeInput
                  inputMode="numeric"
                  value={amt > 0 ? String(amt) : ''}
                  onChange={(e) => setAmt(m.userId, e.target.value)}
                  placeholder="0"
                  disabled={pending}
                  wrapClassName="h-[30px] w-[74px] shrink-0"
                  className={`rounded-lg border bg-white px-2 text-right tabular-nums outline-none focus:border-amber-500 dark:bg-zinc-900 ${
                    amt > 0
                      ? 'border-amber-400 dark:border-amber-500/60'
                      : 'border-zinc-300 dark:border-zinc-700'
                  }`}
                />
                {remaining > 0 ? (
                  <button
                    type="button"
                    onClick={() => giveRest(m.userId)}
                    disabled={pending}
                    aria-label={`${m.nickname}에게 남은 전액`}
                    className="rounded-md px-1 py-0.5 text-[9.5px] font-bold text-amber-600 disabled:opacity-40 dark:text-amber-400"
                  >
                    +잔여
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}

        {/* 기여 0 · 금액 0인 인원은 한 줄로 접는다 — 50명이 전부 펼쳐질 이유가 없다. */}
        {!expandZero && hidden.length > 0 ? (
          <li className="border-t border-zinc-100 py-2 dark:border-zinc-900">
            <button
              type="button"
              onClick={() => setExpandZero(true)}
              className="flex w-full items-center justify-between gap-2 text-left"
            >
              <span className="text-[12px] font-semibold text-zinc-500">
                기여 0 · {hidden.length}명
              </span>
              <span className="text-[10.5px] text-zinc-400">펼쳐서 직접 주기 ⌄</span>
            </button>
          </li>
        ) : null}
      </ul>

      {/* 합계 */}
      <div className="mt-2.5 flex items-center justify-between px-1 text-[12px]">
        <span className="text-zinc-500">
          배분{' '}
          <b className="tabular-nums text-zinc-700 dark:text-zinc-200">
            {total.toLocaleString('ko-KR')}💎
          </b>
          <span className="ml-1 text-zinc-400">· {payload.length}명</span>
        </span>
        <span className={over ? 'font-bold text-red-500' : 'text-zinc-500'}>
          {over ? '초과' : '남김'}{' '}
          <b className="tabular-nums">{Math.abs(remaining).toLocaleString('ko-KR')}💎</b>
        </span>
      </div>

      <button
        type="button"
        onClick={() => setPayAsk(true)}
        disabled={!canPay}
        className="mt-2 w-full rounded-xl bg-amber-600 py-2.5 text-sm font-bold text-white disabled:opacity-40"
      >
        {over
          ? '세금을 초과했습니다'
          : total > 0
            ? `${total.toLocaleString('ko-KR')}💎 지급 · ${payload.length}명`
            : '지급'}
      </button>

      {/* 지급 확인 — 길드 공용 풀이 한 번에 빠져나간다. 수령인·금액을 되읽어준다. */}
      {payAsk && (
        <ModalShell onClose={() => setPayAsk(false)} onSubmit={pay} label="세금 분배 확인">
          <ModalLayout
            title="세금을 분배할까요?"
            subtitle={
              <>
                <span className="font-bold text-zinc-600 dark:text-zinc-300">
                  {payload.length}명
                </span>
                <span className="mx-1 text-zinc-400">·</span>
                <span className="font-mono font-bold text-amber-600 dark:text-amber-400">
                  총 {total.toLocaleString('ko-KR')}💎
                </span>
              </>
            }
            maxBodyClass="max-h-[46vh]"
            footer={
              <>
                <ModalButton tone="ghost" onClick={() => setPayAsk(false)} disabled={pending}>
                  취소
                </ModalButton>
                <ModalButton tone="primary" onClick={pay} disabled={pending}>
                  지급
                </ModalButton>
              </>
            }
          >
            <ul className="space-y-1">
              {payload.map((p) => {
                const m = members.find((x) => x.userId === p.userId)!;
                return (
                  <li key={p.userId} className="flex items-center justify-between gap-2 text-[12.5px]">
                    <span className="truncate text-zinc-600 dark:text-zinc-300">
                      {m.nickname}
                      {p.userId === myUserId ? (
                        <span className="ml-1 text-[10px] font-bold text-amber-500">나</span>
                      ) : null}
                    </span>
                    <span className="shrink-0 font-mono font-bold tabular-nums">
                      {p.amount.toLocaleString('ko-KR')}💎
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 border-t border-zinc-200 pt-2 text-[11px] text-zinc-500 dark:border-zinc-700">
              지급 후 남는 세금 {remaining.toLocaleString('ko-KR')}💎 · 되돌릴 수 없습니다.
            </p>
          </ModalLayout>
        </ModalShell>
      )}
    </section>
  );
}
