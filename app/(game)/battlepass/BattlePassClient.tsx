'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import type { BattlePassView } from '@/lib/game/battlepass';
import { assetUrl } from '@/lib/asset-versions';
import { useResourceToast } from '@/components/ResourceToast';

import { claimAllAction } from './actions';

type CellState = 'claimed' | 'claimable' | 'locked' | 'disabled';

function RewardChip({ icon, amount, state }: { icon: string; amount: number; state: CellState }) {
  const cls =
    state === 'claimable'
      ? 'bg-amber-400 text-amber-950 font-bold'
      : state === 'claimed'
        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
        : state === 'disabled'
          ? 'bg-zinc-100 text-zinc-400 dark:bg-zinc-900 dark:text-zinc-600'
          : 'bg-zinc-100 text-zinc-400 dark:bg-zinc-900 dark:text-zinc-500';
  return (
    <div
      className={`flex items-center justify-center gap-px rounded py-1 text-[9px] leading-none tabular-nums ${cls}`}
    >
      {state === 'claimed' ? <span>✓</span> : state === 'locked' ? <span>🔒</span> : null}
      <span>
        {icon}
        {amount.toLocaleString('ko-KR')}
      </span>
    </div>
  );
}

const sumClaimable = (v: BattlePassView) =>
  v.free.claimable + v.segments.reduce((a, s) => a + s.premiumClaimable, 0);

function PassColumn({ view }: { view: BattlePassView }) {
  const icon = view.rewardKind === 'diamond' ? '💎' : '📦';
  const lvLabel = (l: number) => (view.passType === 'enhance' ? `+${l}` : `✦${l}`);
  const freeState = (l: number): CellState =>
    l > view.maxReached ? 'locked' : l <= view.free.claimedThrough ? 'claimed' : 'claimable';
  const premiumState = (
    s: { purchased: boolean; premiumClaimedThrough: number },
    l: number,
  ): CellState => {
    if (!s.purchased) return 'disabled';
    if (l > view.maxReached) return 'locked';
    return l <= s.premiumClaimedThrough ? 'claimed' : 'claimable';
  };
  // 강조 대상 — 다음으로 받을(아직 도달 못 한) 첫 마일스톤.
  const nextTier =
    Math.floor(view.maxReached / view.tierStep) * view.tierStep + view.tierStep;

  return (
    <div className="min-w-0 flex-1">
      {/* 패스 헤더 — 이름 + 최고 도달 */}
      <div className="mb-1.5 flex items-baseline gap-1">
        <span className="text-[13px]">{icon}</span>
        <span className="text-[12px] font-extrabold">
          {view.passType === 'enhance' ? '강화 패스' : '초월 패스'}
        </span>
        <span className="ml-auto text-[10px] font-bold tabular-nums text-amber-600 dark:text-amber-400">
          {view.maxReached >= 1 ? lvLabel(view.maxReached) : '—'}
        </span>
      </div>
      {/* 컬럼 헤더 */}
      <div className="grid grid-cols-[24px_1fr_1fr] gap-1 px-0.5 pb-1 text-center text-[8px] font-semibold text-zinc-400">
        <span>단계</span>
        <span>무료</span>
        <span>프리</span>
      </div>

      {view.segments.map((s) => {
        const tiers: number[] = [];
        let l = Math.ceil(s.startLevel / view.tierStep) * view.tierStep;
        for (; l <= s.endLevel; l += view.tierStep) tiers.push(l);
        const first = tiers[0] ?? s.startLevel;
        return (
          <section key={s.index} className="mb-2.5">
            <div className="mb-1 flex items-center gap-1">
              <span className="rounded bg-zinc-100 px-1 py-0.5 text-[8px] font-bold tabular-nums text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                {lvLabel(first)}~{lvLabel(s.endLevel)}
              </span>
              <span
                className={`text-[8px] font-bold ${s.purchased ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-400'}`}
              >
                {s.purchased ? '프리미엄✓' : '프리미엄 준비중'}
              </span>
            </div>
            <div className="space-y-1">
              {tiers.map((tl) => {
                const cur = tl === nextTier;
                return (
                  <div
                    key={tl}
                    className={`grid grid-cols-[24px_1fr_1fr] items-center gap-1 ${
                      cur ? 'rounded ring-1 ring-amber-400' : ''
                    }`}
                  >
                    <span
                      className={`text-center text-[9px] font-semibold leading-none tabular-nums ${
                        cur
                          ? 'text-amber-600 dark:text-amber-400'
                          : tl <= view.maxReached
                            ? 'text-zinc-700 dark:text-zinc-200'
                            : 'text-zinc-400'
                      }`}
                    >
                      {lvLabel(tl)}
                    </span>
                    <RewardChip icon={icon} amount={s.freePerTier} state={freeState(tl)} />
                    <RewardChip icon={icon} amount={s.premiumPerTier} state={premiumState(s, tl)} />
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function BattlePassClient({
  enhance,
  transcend,
}: {
  enhance: BattlePassView;
  transcend: BattlePassView;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { showHeaderToast } = useResourceToast();

  const enhClaim = sumClaimable(enhance);
  const traClaim = sumClaimable(transcend);
  const hasClaim = enhClaim > 0 || traClaim > 0;

  const claimAll = () =>
    startTransition(async () => {
      setError(null);
      const rewards: { icon: string; amount: number }[] = [];
      for (const v of [enhance, transcend]) {
        const r = await claimAllAction(v.passType);
        if (r.status === 'error') {
          if (r.code !== 'NOTHING_TO_CLAIM') setError(r.message ?? '오류');
          continue;
        }
        if (typeof r.granted === 'number' && r.granted > 0)
          rewards.push({ icon: v.rewardKind === 'diamond' ? '💎' : '📦', amount: r.granted });
      }
      if (rewards.length) showHeaderToast({ title: '배틀패스 보상', rewards });
      router.refresh();
    });

  return (
    <div className="flex h-full flex-col">
      {/* ── 고정 상단(스크롤·오버스크롤 안 함) — 배너 + 한번에 받기 ── */}
      <div className="shrink-0 border-b border-zinc-200 dark:border-zinc-800">
        <div className="relative h-16 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={assetUrl('/sprites/hub/battlepass.png')}
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full object-cover"
            style={{ imageRendering: 'pixelated' }}
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/65 via-black/40 to-black/65" />
          <div className="relative z-10 flex h-full items-center justify-between px-4">
            <div className="flex flex-col">
              <h1 className="text-base font-extrabold text-white text-pixel-outline">배틀패스</h1>
              <p className="text-[10px] font-semibold text-amber-200 text-pixel-outline">
                성장 패스 · 만료 없음
              </p>
            </div>
            <button
              type="button"
              disabled={pending || !hasClaim}
              onClick={claimAll}
              className="shrink-0 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-3 py-2 text-[12px] font-bold text-amber-950 shadow disabled:opacity-40"
            >
              한번에 받기
              {enhClaim > 0 ? ` 💎${enhClaim.toLocaleString('ko-KR')}` : ''}
              {traClaim > 0 ? ` 📦${traClaim.toLocaleString('ko-KR')}` : ''}
            </button>
          </div>
        </div>
        {error ? (
          <p className="bg-red-50 px-3 py-1 text-[11px] text-red-700 dark:bg-red-950/60 dark:text-red-300">
            {error}
          </p>
        ) : null}
      </div>

      {/* ── 내부 스크롤 — 강화 패스 | 초월 패스 좌우 ── */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
        <div className="flex gap-2.5">
          <PassColumn view={enhance} />
          <div className="w-px shrink-0 self-stretch bg-zinc-200 dark:bg-zinc-800" />
          <PassColumn view={transcend} />
        </div>
        <p className="mt-3 text-center text-[10px] leading-relaxed text-zinc-400">
          만료 없는 성장 패스 · 보상은 상단 ‘한번에 받기’로 무료·프리미엄 모두 수령. 프리미엄은 구간
          구매 시 소급 지급(결제 준비 중).
        </p>
      </div>
    </div>
  );
}
