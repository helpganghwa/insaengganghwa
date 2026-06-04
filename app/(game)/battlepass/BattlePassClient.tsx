'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import type { BattlePassView, BattlePassSegmentView } from '@/lib/game/battlepass';
import type { BattlePassType } from '@/lib/game/balance';
import { useResourceToast } from '@/components/ResourceToast';

import { claimFreeAction, claimPremiumAction } from './actions';

const won = (n: number) => `₩${n.toLocaleString('ko-KR')}`;

type CellState = 'claimed' | 'claimable' | 'locked' | 'disabled';

/** 한 단계의 보상 칸 — 달성/수령/잠금/미구매 상태별 색. */
function TierCell({ icon, amount, state }: { icon: string; amount: number; state: CellState }) {
  const cls =
    state === 'claimable'
      ? 'bg-amber-400 text-amber-950 font-bold'
      : state === 'claimed'
        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
        : state === 'disabled'
          ? 'bg-zinc-100 text-zinc-300 dark:bg-zinc-900 dark:text-zinc-600'
          : 'bg-zinc-100 text-zinc-400 dark:bg-zinc-900 dark:text-zinc-500';
  return (
    <div className={`flex items-center justify-center gap-0.5 rounded-md py-1 text-[11px] tabular-nums ${cls}`}>
      {state === 'claimed' ? <span>✓</span> : state === 'disabled' ? <span>🔒</span> : null}
      <span>
        {icon}
        {amount}
      </span>
    </div>
  );
}

function SegmentBlock({
  seg,
  type,
  icon,
  maxReached,
  freeClaimedThrough,
}: {
  seg: BattlePassSegmentView;
  type: BattlePassType;
  icon: string;
  maxReached: number;
  freeClaimedThrough: number;
}) {
  const levels: number[] = [];
  for (let l = seg.startLevel; l <= seg.endLevel; l++) levels.push(l);
  const lvLabel = (l: number) => (type === 'enhance' ? `+${l}` : `T${l}`);

  const freeState = (l: number): CellState => {
    if (l > maxReached) return 'locked';
    return l <= freeClaimedThrough ? 'claimed' : 'claimable';
  };
  const premiumState = (l: number): CellState => {
    if (!seg.purchased) return 'disabled';
    if (l > maxReached) return 'locked';
    return l <= seg.premiumClaimedThrough ? 'claimed' : 'claimable';
  };

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <div className="text-sm font-bold">
            {type === 'enhance'
              ? `+${seg.startLevel}~+${seg.endLevel}`
              : `T${seg.startLevel}~T${seg.endLevel}`}
          </div>
          <div className="text-[11px] tabular-nums text-zinc-500">
            도달 {seg.reachedTiers}/{seg.endLevel - seg.startLevel + 1}
          </div>
        </div>
        {seg.purchased ? (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
            프리미엄 구매됨
          </span>
        ) : (
          <button
            type="button"
            disabled
            className="rounded-full bg-zinc-200 px-2.5 py-1 text-[10px] font-bold text-zinc-500 dark:bg-zinc-800"
          >
            프리미엄 {won(seg.priceKrw)} · 준비 중
          </button>
        )}
      </div>

      {/* 컬럼 헤더 */}
      <div className="grid grid-cols-[40px_1fr_1fr] gap-1.5 px-0.5 pb-1 text-[10px] font-semibold text-zinc-400">
        <span className="text-center">단계</span>
        <span className="text-center">무료</span>
        <span className="text-center">프리미엄</span>
      </div>

      {/* 티어 트랙 — 각 단계 달성/수령 현황 */}
      <div className="max-h-[46vh] space-y-1 overflow-y-auto pr-0.5">
        {levels.map((l) => (
          <div key={l} className="grid grid-cols-[40px_1fr_1fr] items-center gap-1.5">
            <span
              className={`text-center text-[11px] font-semibold tabular-nums ${
                l <= maxReached ? 'text-zinc-700 dark:text-zinc-200' : 'text-zinc-400'
              }`}
            >
              {lvLabel(l)}
            </span>
            <TierCell icon={icon} amount={seg.freePerTier} state={freeState(l)} />
            <TierCell icon={icon} amount={seg.premiumPerTier} state={premiumState(l)} />
          </div>
        ))}
      </div>
    </section>
  );
}

export function BattlePassClient({
  enhance,
  transcend,
}: {
  enhance: BattlePassView;
  transcend: BattlePassView;
}) {
  const [tab, setTab] = useState<BattlePassType>('enhance');
  const view = tab === 'enhance' ? enhance : transcend;
  const icon = view.rewardKind === 'diamond' ? '💎' : '📦';
  const unit = view.rewardKind === 'diamond' ? '' : '개';
  const reachedLabel = tab === 'enhance' ? `+${view.maxReached}` : `T${view.maxReached}`;
  const premiumClaimable = view.segments.reduce((a, s) => a + s.premiumClaimable, 0);

  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { showHeaderToast } = useResourceToast();

  const run = (fn: () => Promise<{ status: string; message?: string; granted?: number }>) =>
    startTransition(async () => {
      setError(null);
      const r = await fn();
      if (r.status === 'error') setError(r.message ?? '오류');
      else if (typeof r.granted === 'number' && r.granted > 0)
        showHeaderToast({ title: '배틀패스 보상', rewards: [{ icon, amount: r.granted }] });
      router.refresh();
    });

  const tb = (active: boolean) =>
    `flex-1 rounded-full py-2 text-sm font-semibold ${
      active ? 'bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-950' : 'text-zinc-500'
    }`;

  return (
    <div className="space-y-3 px-4 py-4">
      <div className="flex gap-1.5 rounded-full bg-zinc-100 p-1 dark:bg-zinc-900">
        <button type="button" className={tb(tab === 'enhance')} onClick={() => setTab('enhance')}>
          강화 패스
        </button>
        <button type="button" className={tb(tab === 'transcend')} onClick={() => setTab('transcend')}>
          초월 패스
        </button>
      </div>

      <div className="flex items-baseline justify-between px-1">
        <span className="text-xs text-zinc-500">최고 도달</span>
        <span className="text-lg font-bold tabular-nums">{reachedLabel}</span>
      </div>

      {error ? (
        <p className="rounded bg-red-50 px-2 py-1 text-[11px] text-red-700 dark:bg-red-950/60 dark:text-red-300">
          {error}
        </p>
      ) : null}

      {/* 일괄 수령 */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={pending || view.free.claimable <= 0}
          onClick={() => run(() => claimFreeAction(tab))}
          className="rounded-xl bg-amber-500 py-2.5 text-xs font-bold text-amber-950 disabled:opacity-40"
        >
          무료 받기 {view.free.claimable > 0 ? `${icon}${view.free.claimable.toLocaleString('ko-KR')}${unit}` : ''}
        </button>
        <button
          type="button"
          disabled={pending || premiumClaimable <= 0}
          onClick={() => run(() => claimPremiumAction(tab))}
          className="rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 py-2.5 text-xs font-bold text-amber-950 disabled:opacity-40"
        >
          프리미엄 받기 {premiumClaimable > 0 ? `${icon}${premiumClaimable.toLocaleString('ko-KR')}${unit}` : ''}
        </button>
      </div>

      {/* 구간별 티어 트랙 */}
      {view.segments.map((seg) => (
        <SegmentBlock
          key={seg.index}
          seg={seg}
          type={tab}
          icon={icon}
          maxReached={view.maxReached}
          freeClaimedThrough={view.free.claimedThrough}
        />
      ))}

      <p className="px-1 pt-1 text-[11px] leading-relaxed text-zinc-400">
        성장 패스는 만료가 없습니다. 단계별 달성 현황이 표시되며, 무료/프리미엄 보상은 위 버튼으로
        한 번에 수령합니다. 프리미엄은 구간 구매 시 이미 넘긴 단계까지 소급 지급됩니다. (결제 준비 중)
      </p>
    </div>
  );
}
