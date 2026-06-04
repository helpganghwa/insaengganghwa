'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import type { BattlePassView } from '@/lib/game/battlepass';
import type { BattlePassType } from '@/lib/game/balance';
import { assetUrl } from '@/lib/asset-versions';
import { useResourceToast } from '@/components/ResourceToast';

import { claimAllAction } from './actions';

const won = (n: number) => `₩${n.toLocaleString('ko-KR')}`;

type CellState = 'claimed' | 'claimable' | 'locked' | 'disabled';

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
    <div className={`flex items-center justify-center gap-0.5 rounded-md py-1.5 text-[12px] tabular-nums ${cls}`}>
      {state === 'claimed' ? <span>✓</span> : state === 'disabled' ? <span>🔒</span> : null}
      <span>
        {icon}
        {amount}
      </span>
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
  const [tab, setTab] = useState<BattlePassType>('enhance');
  const view = tab === 'enhance' ? enhance : transcend;
  const icon = view.rewardKind === 'diamond' ? '💎' : '📦';
  const unit = view.rewardKind === 'diamond' ? '' : '개';
  const premiumClaimable = view.segments.reduce((a, s) => a + s.premiumClaimable, 0);
  const totalClaimable = view.free.claimable + premiumClaimable;

  const [selIdx, setSelIdx] = useState(view.segments.length - 1);
  useEffect(() => {
    setSelIdx(view.segments.length - 1);
  }, [tab, view.segments.length]);
  const seg = view.segments[Math.min(selIdx, view.segments.length - 1)] ?? view.segments[0]!;

  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { showHeaderToast } = useResourceToast();

  const claimAll = () =>
    startTransition(async () => {
      setError(null);
      const r = await claimAllAction(tab);
      if (r.status === 'error') setError(r.message ?? '오류');
      else if (typeof r.granted === 'number' && r.granted > 0)
        showHeaderToast({ title: '배틀패스 보상', rewards: [{ icon, amount: r.granted }] });
      router.refresh();
    });

  const passTb = (active: boolean) =>
    `flex-1 rounded-full py-1.5 text-[13px] font-semibold ${
      active ? 'bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-950' : 'text-zinc-500'
    }`;

  const levels: number[] = [];
  for (let l = seg.startLevel; l <= seg.endLevel; l++) levels.push(l);
  const lvLabel = (l: number) => (tab === 'enhance' ? `+${l}` : `T${l}`);
  const segShort = (s: { startLevel: number; endLevel: number }) =>
    tab === 'enhance' ? [`+${s.startLevel}`, `~${s.endLevel}`] : [`T${s.startLevel}`, `~${s.endLevel}`];
  const freeState = (l: number): CellState =>
    l > view.maxReached ? 'locked' : l <= view.free.claimedThrough ? 'claimed' : 'claimable';
  const premiumState = (l: number): CellState => {
    if (!seg.purchased) return 'disabled';
    if (l > view.maxReached) return 'locked';
    return l <= seg.premiumClaimedThrough ? 'claimed' : 'claimable';
  };

  return (
    <div className="pb-6">
      {/* ① 상단 이미지 배너 — 배틀패스 + 현재 패스 */}
      <div className="relative h-28 overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={assetUrl('/sprites/hub/battlepass.png')}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover"
          style={{ imageRendering: 'pixelated' }}
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/45 via-black/35 to-black/70" />
        <div className="relative z-10 flex h-full flex-col items-center justify-center gap-0.5">
          <h1 className="text-lg font-extrabold text-white text-pixel-outline">배틀패스</h1>
          <p className="text-[11px] font-bold text-amber-200 text-pixel-outline">
            {tab === 'enhance' ? '강화 패스' : '초월 패스'}
          </p>
        </div>
      </div>

      {/* ③ 스티키 — 패스 토글 + ④ 한번에 받기(무료+프리미엄) */}
      <div className="sticky top-0 z-20 border-b border-zinc-200 bg-white/95 px-4 py-2 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
        <div className="flex items-center gap-2">
          <div className="flex flex-1 gap-1 rounded-full bg-zinc-100 p-1 dark:bg-zinc-900">
            <button type="button" className={passTb(tab === 'enhance')} onClick={() => setTab('enhance')}>
              강화 패스
            </button>
            <button type="button" className={passTb(tab === 'transcend')} onClick={() => setTab('transcend')}>
              초월 패스
            </button>
          </div>
          <button
            type="button"
            disabled={pending || totalClaimable <= 0}
            onClick={claimAll}
            className="shrink-0 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-3.5 py-2 text-[12px] font-bold text-amber-950 disabled:opacity-40"
          >
            한번에 받기{totalClaimable > 0 ? ` ${icon}${totalClaimable.toLocaleString('ko-KR')}${unit}` : ''}
          </button>
        </div>
        {error ? (
          <p className="mt-1.5 rounded bg-red-50 px-2 py-1 text-[11px] text-red-700 dark:bg-red-950/60 dark:text-red-300">
            {error}
          </p>
        ) : null}
      </div>

      <div className="flex gap-2 px-4 pt-3">
        {/* ⑤ 구간(티어) 필터 — 좌측 */}
        <aside className="sticky top-14 flex shrink-0 flex-col gap-1.5 self-start">
          {view.segments.map((s) => {
            const [a, b] = segShort(s);
            const active = s.index === seg.index;
            return (
              <button
                key={s.index}
                type="button"
                onClick={() => setSelIdx(s.index)}
                className={`flex w-12 flex-col items-center rounded-lg border py-1.5 text-[11px] font-semibold leading-tight tabular-nums ${
                  active
                    ? 'border-amber-500 bg-amber-500 text-amber-950'
                    : 'border-zinc-200 text-zinc-500 dark:border-zinc-800'
                }`}
              >
                <span>{a}</span>
                <span>{b}</span>
              </button>
            );
          })}
        </aside>

        {/* 선택 구간 티어 트랙 — 전체 스크롤 */}
        <div className="min-w-0 flex-1">
          <div className="mb-2">
            {seg.purchased ? (
              <span className="inline-block rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                프리미엄 구매됨
              </span>
            ) : (
              <button
                type="button"
                disabled
                className="w-full rounded-lg bg-zinc-200 py-1.5 text-[11px] font-bold text-zinc-500 dark:bg-zinc-800"
              >
                프리미엄 {won(seg.priceKrw)} · 준비 중
              </button>
            )}
          </div>

          <div className="grid grid-cols-[36px_1fr_1fr] gap-1.5 px-0.5 pb-1 text-[10px] font-semibold text-zinc-400">
            <span className="text-center">단계</span>
            <span className="text-center">무료</span>
            <span className="text-center">프리미엄</span>
          </div>
          <div className="space-y-1">
            {levels.map((l) => (
              <div key={l} className="grid grid-cols-[36px_1fr_1fr] items-center gap-1.5">
                <span
                  className={`text-center text-[11px] font-semibold tabular-nums ${
                    l <= view.maxReached ? 'text-zinc-700 dark:text-zinc-200' : 'text-zinc-400'
                  }`}
                >
                  {lvLabel(l)}
                </span>
                <TierCell icon={icon} amount={seg.freePerTier} state={freeState(l)} />
                <TierCell icon={icon} amount={seg.premiumPerTier} state={premiumState(l)} />
              </div>
            ))}
          </div>
        </div>
      </div>

      <p className="px-4 pt-3 text-[11px] leading-relaxed text-zinc-400">
        성장 패스는 만료가 없습니다. 단계별 달성 현황이 표시되며, 보상은 상단 '한번에 받기'로
        무료·프리미엄을 모두 수령합니다. 프리미엄은 구간 구매 시 이미 넘긴 단계까지 소급 지급됩니다.
        (결제 준비 중)
      </p>
    </div>
  );
}
