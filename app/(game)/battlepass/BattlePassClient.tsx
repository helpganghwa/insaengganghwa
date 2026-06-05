'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import type { BattlePassView } from '@/lib/game/battlepass';
import type { BattlePassType } from '@/lib/game/balance';
import { assetUrl } from '@/lib/asset-versions';
import { useResourceToast } from '@/components/ResourceToast';

import { claimAllAction, claimTierAction } from './actions';

type CellState = 'claimed' | 'claimable' | 'locked' | 'disabled';

/** 보상 셀 — claimable이면 탭하여 그 단계까지 개별 수령(버튼). */
function RewardChip({
  icon,
  amount,
  state,
  onClaim,
  disabled,
}: {
  icon: string;
  amount: number;
  state: CellState;
  onClaim?: () => void;
  disabled?: boolean;
}) {
  const cls =
    state === 'claimable'
      ? 'bg-amber-400 text-amber-950 font-bold active:bg-amber-500'
      : state === 'claimed'
        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
        : 'bg-zinc-100 text-zinc-400 dark:bg-zinc-900 dark:text-zinc-500';
  const body = (
    <>
      {state === 'claimed' ? <span>✓</span> : null}
      <span>
        {icon}
        {amount.toLocaleString('ko-KR')}
      </span>
    </>
  );
  const base = 'flex w-full items-center justify-center gap-px rounded py-1 text-[9px] leading-none tabular-nums';
  if (state === 'claimable' && onClaim) {
    return (
      <button type="button" disabled={disabled} onClick={onClaim} className={`${base} ${cls} disabled:opacity-50`}>
        {body}
      </button>
    );
  }
  return <div className={`${base} ${cls}`}>{body}</div>;
}

const sumClaimable = (v: BattlePassView) =>
  v.free.claimable + v.segments.reduce((a, s) => a + s.premiumClaimable, 0);

function PassColumn({
  view,
  pending,
  onClaim,
  onPremiumLocked,
}: {
  view: BattlePassView;
  pending: boolean;
  onClaim: (line: 'free' | 'premium', level: number, segmentIndex: number) => void;
  onPremiumLocked: () => void;
}) {
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
  const nextTier = Math.floor(view.maxReached / view.tierStep) * view.tierStep + view.tierStep;

  return (
    <div className="min-w-0 flex-1">
      <div className="mb-1.5 flex items-baseline gap-1">
        <span className="text-[13px]">{icon}</span>
        <span className="text-[12px] font-extrabold">
          {view.passType === 'enhance' ? '강화 패스' : '초월 패스'}
        </span>
        <span className="ml-auto text-[10px] font-bold tabular-nums text-amber-600 dark:text-amber-400">
          {view.maxReached >= 1 ? lvLabel(view.maxReached) : '—'}
        </span>
      </div>
      <div className="grid grid-cols-[20px_1fr_52px] gap-1 px-0.5 pb-1 text-center text-[8px] font-semibold text-zinc-400">
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
              {s.purchased ? (
                <span className="text-[8px] font-bold text-amber-600 dark:text-amber-400">프리미엄✓</span>
              ) : null}
            </div>
            <div className="relative">
              <div className="space-y-1">
                {tiers.map((tl) => {
                  const cur = tl === nextTier;
                  return (
                    <div
                      key={tl}
                      className={`grid grid-cols-[20px_1fr_52px] items-center gap-1 ${
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
                      <RewardChip
                        icon={icon}
                        amount={s.freePerTier}
                        state={freeState(tl)}
                        disabled={pending}
                        onClaim={() => onClaim('free', tl, s.index)}
                      />
                      {s.purchased ? (
                        <RewardChip
                          icon={icon}
                          amount={s.premiumPerTier}
                          state={premiumState(s, tl)}
                          disabled={pending}
                          onClaim={() => onClaim('premium', tl, s.index)}
                        />
                      ) : (
                        <div className="py-1 text-[9px]">&nbsp;</div>
                      )}
                    </div>
                  );
                })}
              </div>
              {/* 미결제 구간 — 프리미엄 컬럼 전체에 '프리미엄 결제' 오버레이 */}
              {!s.purchased ? (
                <button
                  type="button"
                  onClick={onPremiumLocked}
                  className="absolute inset-y-0 right-0 flex w-[52px] flex-col items-center justify-center rounded bg-zinc-900/85 text-center text-[9px] font-bold leading-tight text-white"
                >
                  <span>프리미엄</span>
                  <span>결제</span>
                </button>
              ) : null}
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
      if (rewards.length) showHeaderToast({ title: '성장패스 보상', rewards });
      router.refresh();
    });

  const claimTier = (type: BattlePassType) => (line: 'free' | 'premium', level: number, segmentIndex: number) =>
    startTransition(async () => {
      setError(null);
      const r = await claimTierAction(type, line, level, segmentIndex);
      if (r.status === 'error') {
        if (r.code !== 'NOTHING_TO_CLAIM') setError(r.message ?? '오류');
      } else if (typeof r.granted === 'number' && r.granted > 0) {
        showHeaderToast({
          title: '성장패스 보상',
          rewards: [{ icon: r.rewardKind === 'diamond' ? '💎' : '📦', amount: r.granted }],
        });
      }
      router.refresh();
    });

  const onPremiumLocked = () => setError('프리미엄 결제는 준비 중입니다.');

  return (
    <div className="flex h-full flex-col">
      {/* ── 고정 상단(스크롤·오버스크롤 안 함) ── */}
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
            <h1 className="text-base font-extrabold text-white text-pixel-outline">성장패스</h1>
            <button
              type="button"
              disabled={pending || !hasClaim}
              onClick={claimAll}
              className="shrink-0 rounded-md bg-gradient-to-r from-amber-500 to-orange-500 px-2.5 py-1.5 text-[11px] font-extrabold text-amber-950 shadow-sm disabled:opacity-40"
            >
              한번에 받기
              {enhClaim > 0 ? ` 💎${enhClaim.toLocaleString('ko-KR')}` : ''}
              {traClaim > 0 ? ` 📦${traClaim.toLocaleString('ko-KR')}` : ''}
            </button>
          </div>
        </div>
        {error ? (
          <p className="bg-amber-50 px-3 py-1 text-[11px] text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
            {error}
          </p>
        ) : null}
      </div>

      {/* ── 내부 스크롤 — 강화 | 초월 좌우 ── */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
        <div className="flex gap-2.5">
          <PassColumn view={enhance} pending={pending} onClaim={claimTier('enhance')} onPremiumLocked={onPremiumLocked} />
          <div className="w-px shrink-0 self-stretch bg-zinc-200 dark:bg-zinc-800" />
          <PassColumn view={transcend} pending={pending} onClaim={claimTier('transcend')} onPremiumLocked={onPremiumLocked} />
        </div>
      </div>
    </div>
  );
}
