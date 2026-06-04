'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import type { BattlePassView } from '@/lib/game/battlepass';
import type { BattlePassType } from '@/lib/game/balance';
import { useResourceToast } from '@/components/ResourceToast';

import { claimFreeAction, claimPremiumAction } from './actions';

const won = (n: number) => `₩${n.toLocaleString('ko-KR')}`;

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

  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { showHeaderToast } = useResourceToast();

  const run = (fn: () => Promise<{ status: string; message?: string; granted?: number }>) =>
    startTransition(async () => {
      setError(null);
      const r = await fn();
      if (r.status === 'error') {
        setError(r.message ?? '오류');
      } else if (typeof r.granted === 'number' && r.granted > 0) {
        showHeaderToast({ title: '배틀패스 보상', rewards: [{ icon, amount: r.granted }] });
      }
      router.refresh();
    });

  const tb = (active: boolean) =>
    `flex-1 rounded-full py-2 text-sm font-semibold ${
      active
        ? 'bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-950'
        : 'text-zinc-500'
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

      {/* 무료 라인 — 전 구간 누적 수령 */}
      <div className="flex items-center justify-between rounded-2xl border border-zinc-200 bg-white px-3 py-3 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-zinc-500">무료 보상</div>
          <div className="mt-0.5 text-sm font-bold tabular-nums">
            받을 수 있음 {icon} {view.free.claimable.toLocaleString('ko-KR')}
            {unit}
          </div>
        </div>
        <button
          type="button"
          disabled={pending || view.free.claimable <= 0}
          onClick={() => run(() => claimFreeAction(tab))}
          className="shrink-0 rounded-full bg-amber-500 px-4 py-2 text-xs font-bold text-amber-950 disabled:opacity-40"
        >
          받기
        </button>
      </div>

      {/* 프리미엄 한 번에 받기 (산 구간 전체) */}
      {view.segments.some((s) => s.purchased && s.premiumClaimable > 0) ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => claimPremiumAction(tab))}
          className="w-full rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 py-2.5 text-sm font-bold text-amber-950 disabled:opacity-40"
        >
          프리미엄 보상 한 번에 받기
        </button>
      ) : null}

      {/* 구간 목록 */}
      <div className="space-y-2">
        {view.segments.map((s) => {
          const label =
            tab === 'enhance'
              ? `+${s.startLevel}~+${s.endLevel}`
              : `T${s.startLevel}~T${s.endLevel}`;
          return (
            <div
              key={s.index}
              className="rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950"
            >
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-bold">{label}</span>
                <span className="text-[11px] tabular-nums text-zinc-500">
                  도달 {s.reachedTiers}/{view.segmentSize}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-3 text-[11px] text-zinc-500">
                <span>
                  무료 {icon}
                  {s.freePerTier}/단계
                </span>
                <span className="font-semibold text-amber-600 dark:text-amber-400">
                  프리미엄 {icon}
                  {s.premiumPerTier}/단계
                </span>
              </div>

              <div className="mt-2">
                {s.purchased ? (
                  <div className="flex items-center justify-between rounded-lg bg-amber-50 px-2.5 py-1.5 dark:bg-amber-950/30">
                    <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                      프리미엄 받을 수 있음 {icon}{' '}
                      {s.premiumClaimable.toLocaleString('ko-KR')}
                      {unit}
                    </span>
                    <span className="text-[10px] text-amber-600/80 dark:text-amber-400/80">구매됨</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="w-full rounded-lg bg-zinc-200 py-1.5 text-[11px] font-bold text-zinc-500 dark:bg-zinc-800"
                  >
                    프리미엄 {won(s.priceKrw)} · 준비 중
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="px-1 pt-1 text-[11px] leading-relaxed text-zinc-400">
        성장 패스는 만료가 없습니다. 무료 보상은 강화/초월 최고 도달에 따라 누적되며, 프리미엄
        구간은 구매 시 이미 넘긴 단계까지 소급 지급됩니다. (결제는 정식 오픈 시 제공)
      </p>
    </div>
  );
}
