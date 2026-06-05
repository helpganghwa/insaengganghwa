'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
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

  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { showHeaderToast } = useResourceToast();

  // 진입/패스 전환 시 현재 도달 단계로 자동 스크롤(받을 보상이 바로 보이게).
  const currentRowRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const id = window.setTimeout(() => {
      currentRowRef.current?.scrollIntoView({ block: 'center', behavior: 'auto' });
    }, 0);
    return () => window.clearTimeout(id);
  }, [tab]);

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

  const lvLabel = (l: number) => (tab === 'enhance' ? `+${l}` : `T${l}`);
  const segRange = (s: { startLevel: number; endLevel: number }) =>
    tab === 'enhance' ? `+${s.startLevel}~+${s.endLevel}` : `T${s.startLevel}~T${s.endLevel}`;
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

  // 자동 스크롤·강조 대상 단계 — 최고 도달(없으면 첫 단계).
  const scrollLevel = view.maxReached >= 1 ? view.maxReached : view.segments[0]?.startLevel ?? 1;

  return (
    <div className="pb-6">
      {/* 상단 sticky 헤더 — 이미지 배너 + 패스 토글 + 한번에 받기 (배너 포함 sticky) */}
      <div className="sticky top-0 z-30">
      {/* 이미지 배너 — 배틀패스 + 현재 패스 */}
      <div className="relative h-20 overflow-hidden">
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

      {/* 패스 토글 + 한번에 받기(무료+프리미엄) */}
      <div className="border-b border-zinc-200 bg-white/95 px-4 py-2 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
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
      </div>
      {/* /상단 sticky 헤더 */}

      <div className="px-4">
        {/* 진행 요약 — 최고 도달 + 받을 보상 */}
        <div className="mt-3 flex items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 dark:border-zinc-800 dark:bg-zinc-900/50">
          <div className="flex flex-col">
            <span className="text-[10px] font-semibold text-zinc-400">최고 도달</span>
            <span className="text-lg font-extrabold tabular-nums leading-tight text-zinc-800 dark:text-zinc-100">
              {view.maxReached >= 1 ? lvLabel(view.maxReached) : '시작 전'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => currentRowRef.current?.scrollIntoView({ block: 'center' })}
            className="rounded-full border border-zinc-300 px-3 py-1.5 text-[11px] font-semibold text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
          >
            현재 단계로
          </button>
          <div className="flex flex-col items-end">
            <span className="text-[10px] font-semibold text-zinc-400">받을 보상</span>
            <span className="text-lg font-extrabold tabular-nums leading-tight text-amber-600 dark:text-amber-400">
              {totalClaimable > 0 ? `${icon}${totalClaimable.toLocaleString('ko-KR')}${unit}` : '없음'}
            </span>
          </div>
        </div>

        {/* 컬럼 헤더 — 스크롤 중에도 보이도록 sticky 헤더 아래 고정 */}
        <div className="sticky top-[126px] z-10 grid grid-cols-[52px_1fr_1fr] gap-1.5 border-b border-zinc-200 bg-white/95 px-0.5 py-1.5 text-[10px] font-semibold text-zinc-400 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
          <span className="text-center">단계</span>
          <span className="text-center">무료</span>
          <span className="text-center">프리미엄</span>
        </div>

        {/* 현재 볼 수 있는 모든 구간을 한 번에 노출(좌측 선택 없음) */}
        {view.segments.map((s) => {
          const segLevels: number[] = [];
          for (let l = s.startLevel; l <= s.endLevel; l++) segLevels.push(l);
          const segSize = s.endLevel - s.startLevel + 1;
          const reachedInSeg = Math.max(0, Math.min(view.maxReached, s.endLevel) - (s.startLevel - 1));
          const segPct = Math.round((reachedInSeg / segSize) * 100);
          const segDone = view.maxReached >= s.endLevel;
          const segStarted = view.maxReached >= s.startLevel;
          return (
            <section key={s.index} className="pt-4">
              {/* 구간 헤더 — 범위 + 프리미엄 상태 + 진행바 */}
              <div className="mb-2">
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="rounded-md bg-zinc-100 px-2 py-1 text-[11px] font-bold tabular-nums text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
                    {segRange(s)}
                  </span>
                  {s.purchased ? (
                    <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                      프리미엄 구매됨
                    </span>
                  ) : (
                    <span className="rounded-full bg-zinc-200 px-2.5 py-1 text-[10px] font-bold text-zinc-500 dark:bg-zinc-800">
                      프리미엄 {won(s.priceKrw)} · 준비 중
                    </span>
                  )}
                  <span className="ml-auto text-[10px] font-semibold tabular-nums text-zinc-400">
                    {segDone
                      ? '완료'
                      : segStarted
                        ? `${lvLabel(view.maxReached)} / ${lvLabel(s.endLevel)}`
                        : `0 / ${segSize}`}
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500"
                    style={{ width: `${segPct}%` }}
                  />
                </div>
              </div>
              <div className="space-y-1">
                {segLevels.map((l) => {
                  const isCurrent = l === scrollLevel;
                  return (
                    <div
                      key={l}
                      ref={isCurrent ? currentRowRef : undefined}
                      className={`grid grid-cols-[52px_1fr_1fr] items-center gap-1.5 ${
                        isCurrent
                          ? 'rounded-md py-0.5 ring-1 ring-amber-400 ring-offset-1 ring-offset-white dark:ring-offset-zinc-950'
                          : ''
                      }`}
                    >
                      <span
                        className={`flex flex-col items-center justify-center text-[11px] font-semibold leading-none tabular-nums ${
                          isCurrent
                            ? 'text-amber-600 dark:text-amber-400'
                            : l <= view.maxReached
                              ? 'text-zinc-700 dark:text-zinc-200'
                              : 'text-zinc-400'
                        }`}
                      >
                        {lvLabel(l)}
                        {isCurrent ? <span className="mt-0.5 text-[8px] font-bold">현재</span> : null}
                      </span>
                      <TierCell icon={icon} amount={s.freePerTier} state={freeState(l)} />
                      <TierCell icon={icon} amount={s.premiumPerTier} state={premiumState(s, l)} />
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <p className="px-4 pt-3 text-[11px] leading-relaxed text-zinc-400">
        성장 패스는 만료가 없습니다. 단계별 달성 현황이 표시되며, 보상은 상단 '한번에 받기'로
        무료·프리미엄을 모두 수령합니다. 프리미엄은 구간 구매 시 이미 넘긴 단계까지 소급 지급됩니다.
        (결제 준비 중)
      </p>
    </div>
  );
}
