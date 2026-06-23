'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { useResourceToast } from '@/components/ResourceToast';
import { useDiamond } from '@/components/DiamondContext';

import { distributeTaxManualAction } from '../actions';
import { guildErrMsg } from '../errors-msg';

type Role = 'leader' | 'vice' | 'member';
type Member = { userId: string; nickname: string; role: Role };
const ROLE_BADGE: Record<Role, { label: string; cls: string } | null> = {
  leader: { label: '길드장', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' },
  vice: { label: '부길드장', cls: 'bg-sky-500/15 text-sky-700 dark:text-sky-300' },
  member: null,
};

export function DistributeBoard({
  myUserId,
  pool: poolStr,
  members,
}: {
  myUserId: string;
  pool: string;
  members: Member[];
}) {
  const router = useRouter();
  const { showHeaderToast, showError } = useResourceToast();
  const { optimisticAdjust } = useDiamond();
  const [pending, start] = useTransition();
  const pool = Number(poolStr);
  // 유저별 입력(문자열). 숫자만 허용.
  const [amounts, setAmounts] = useState<Record<string, string>>({});

  const setAmt = (userId: string, v: string) =>
    setAmounts((p) => ({ ...p, [userId]: v.replace(/[^0-9]/g, '') }));

  const parsed = useMemo(
    () => members.map((m) => ({ m, amt: Math.max(0, Math.floor(Number(amounts[m.userId] || 0))) })),
    [members, amounts],
  );
  const total = parsed.reduce((s, x) => s + x.amt, 0);
  const remaining = pool - total;
  const over = total > pool;
  const canPay = total > 0 && !over && !pending;

  // 균등 분배 — 각 입력란에 floor(pool/N) 자동 입력(잔여는 풀에 남음).
  const fillEqual = () => {
    if (members.length === 0 || pool <= 0) return;
    const per = Math.floor(pool / members.length);
    const next: Record<string, string> = {};
    for (const m of members) next[m.userId] = per > 0 ? String(per) : '';
    setAmounts(next);
  };

  const clearAll = () => setAmounts({});

  const pay = () => {
    if (!canPay) return;
    const payload = parsed.filter((x) => x.amt > 0).map((x) => ({ userId: x.m.userId, amount: x.amt }));
    const mine = payload.find((p) => p.userId === myUserId)?.amount ?? 0;
    start(async () => {
      const r = await distributeTaxManualAction(payload);
      if (r.status !== 'success') return showError(guildErrMsg(r.code));
      if (mine > 0) optimisticAdjust(BigInt(mine)); // 내 몫은 헤더 다이아 즉시 반영
      showHeaderToast({ title: `세금 분배 완료 (총 ${total.toLocaleString('ko-KR')}💎)` });
      setAmounts({});
      router.refresh(); // 풀 갱신
    });
  };

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
      <h3 className="text-sm font-bold">세금 분배</h3>

      {/* 세금 잔액 + 균등/지우기 — 카드 내부라 테두리 없이 옅은 배경 행 */}
      <div className="mt-3 flex items-center justify-between gap-2 rounded-lg bg-zinc-50 px-3 py-2.5 dark:bg-zinc-900">
        <div>
          <p className="text-[11px] text-zinc-500">세금</p>
          <p className="text-base font-bold tabular-nums">💎 {pool.toLocaleString('ko-KR')}</p>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <button
            type="button"
            onClick={clearAll}
            disabled={pending || total === 0}
            className="rounded-lg px-3 py-2 text-[12px] font-semibold text-zinc-500 disabled:opacity-40"
          >
            지우기
          </button>
          <button
            type="button"
            onClick={fillEqual}
            disabled={pending || pool <= 0}
            className="rounded-lg bg-emerald-600 px-3 py-2 text-[12px] font-bold text-white disabled:opacity-40"
          >
            균등 분배
          </button>
        </div>
      </div>

      {/* 길드원 입력 목록 */}
      <ul className="mt-2 divide-y divide-zinc-100 dark:divide-zinc-900">
        {parsed.map(({ m, amt }) => {
          const badge = ROLE_BADGE[m.role];
          return (
            <li
              key={m.userId}
              className="flex items-center gap-2 px-1 py-2"
            >
              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                <span className="truncate text-[13px] font-semibold">{m.nickname}</span>
                {badge && (
                  <span className={`shrink-0 rounded-full px-1.5 py-0 text-[9px] font-bold ${badge.cls}`}>
                    {badge.label}
                  </span>
                )}
                {m.userId === myUserId && (
                  <span className="shrink-0 text-[9px] font-bold text-zinc-400">나</span>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <span className="text-[12px] text-zinc-400">💎</span>
                <input
                  inputMode="numeric"
                  value={amounts[m.userId] ?? ''}
                  onChange={(e) => setAmt(m.userId, e.target.value)}
                  placeholder="0"
                  className={`w-20 rounded-lg border bg-white px-2 py-1.5 text-right text-base tabular-nums outline-none focus:border-zinc-400 dark:bg-zinc-900 ${
                    amt > 0
                      ? 'border-amber-400 dark:border-amber-500/60'
                      : 'border-zinc-300 dark:border-zinc-700'
                  }`}
                />
              </div>
            </li>
          );
        })}
      </ul>

      {/* 분배 내역은 길드 홈 '길드 로그'에서 상세 노출(수령자별 1줄) — 여기선 생략. */}

      {/* 합계 + 지급 */}
      <div className="mt-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
        <div className="flex items-center justify-between text-[12px]">
          <span className="text-zinc-500">
            분배 합계 <span className="font-mono font-bold text-zinc-700 dark:text-zinc-200">{total.toLocaleString('ko-KR')}💎</span>
          </span>
          <span className={over ? 'font-bold text-red-500' : 'text-zinc-500'}>
            남은 세금 <span className="font-mono font-bold tabular-nums">{remaining.toLocaleString('ko-KR')}💎</span>
          </span>
        </div>
        <button
          type="button"
          onClick={pay}
          disabled={!canPay}
          className="mt-2 w-full rounded-lg bg-amber-600 py-2.5 text-sm font-bold text-white disabled:opacity-40"
        >
          {over ? '세금을 초과했습니다' : `지급${total > 0 ? ` (${total.toLocaleString('ko-KR')}💎)` : ''}`}
        </button>
      </div>
    </section>
  );
}
