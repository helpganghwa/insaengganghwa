'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import type { BattlePassView, BattlePassSegmentView } from '@/lib/game/battlepass';
import type { BattlePassType } from '@/lib/game/balance';
import { assetUrl } from '@/lib/asset-versions';
import { useResourceToast } from '@/components/ResourceToast';
import { useDiamond } from '@/components/DiamondContext';
import { PublicFooter } from '@/components/PublicFooter';
import { runCheckout } from '@/app/(game)/shop/checkout';
import { verifyPurchaseAction } from '@/app/(game)/shop/actions';

import { claimSegmentAction, claimTierAction } from './actions';

const won = (n: number) => `₩${n.toLocaleString('ko-KR')}`;
type Line = 'free' | 'premium';

// 레벨 칸은 강화 +1000 / 초월 ✦100(최대 5글자)까지 안 깨지게 고정폭. 무료·프리미엄은 1fr 동일폭.
const LV_COL = 40; // px
const GRID = 'grid grid-cols-[40px_1fr_1fr] gap-1';
// 프리미엄(맨 오른쪽 1fr) 칸 폭 = (전체 - 레벨칸 - 양 gap)/2. gap-1=4px ×2.
const PREMIUM_W = `calc((100% - ${LV_COL}px - 8px) / 2)`;

/** 그 구간에서 maxReached 이하인 마일스톤 단계 목록. */
function tierLevels(view: BattlePassView, s: BattlePassSegmentView): number[] {
  const step = view.tierStep;
  const cap = Math.min(view.maxReached, s.endLevel);
  const out: number[] = [];
  for (let l = Math.ceil(s.startLevel / step) * step; l <= cap; l += step) out.push(l);
  return out;
}
/** 그 구간의 전체 마일스톤(미도달 포함) — 표 렌더용. */
function allTierLevels(view: BattlePassView, s: BattlePassSegmentView): number[] {
  const step = view.tierStep;
  const out: number[] = [];
  for (let l = Math.ceil(s.startLevel / step) * step; l <= s.endLevel; l += step) out.push(l);
  return out;
}

function RewardChip({
  icon,
  amount,
  variant,
  onClick,
}: {
  icon: string;
  amount: number;
  variant: 'claimed' | 'claimable' | 'locked' | 'preview';
  onClick?: () => void;
}) {
  const cls =
    variant === 'claimable'
      ? 'bg-amber-400 text-amber-950 font-bold active:bg-amber-500'
      : variant === 'claimed'
        ? 'bg-zinc-200 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
        : 'bg-zinc-100 text-zinc-400 dark:bg-zinc-900 dark:text-zinc-500';
  const base =
    'relative flex w-full items-center justify-center gap-px isolate overflow-hidden rounded py-1 text-[9px] leading-none tabular-nums';
  // 수령 완료 — 보상이 보이는 채로 '완료' 도장을 비스듬히 찍음.
  const body = (
    <>
      <span>
        {icon}
        {amount.toLocaleString('ko-KR')}
      </span>
      {variant === 'claimed' ? (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="-rotate-[18deg] rounded-sm border border-red-600/80 px-0.5 text-[8px] font-extrabold leading-none text-red-600/90 dark:border-red-500/80 dark:text-red-400">
            완료
          </span>
        </span>
      ) : null}
    </>
  );
  if (variant === 'claimable' && onClick) {
    return (
      <button type="button" onClick={onClick} className={`${base} ${cls}`}>
        {body}
      </button>
    );
  }
  return <div className={`${base} ${cls}`}>{body}</div>;
}

function PassColumn({
  view,
  isClaimed,
  onClaimTier,
  onClaimSegment,
  onPremiumLocked,
}: {
  view: BattlePassView;
  isClaimed: (line: Line, segIndex: number, level: number) => boolean;
  onClaimTier: (line: Line, level: number, s: BattlePassSegmentView) => void;
  onClaimSegment: (s: BattlePassSegmentView) => void;
  onPremiumLocked: (passType: BattlePassType, segmentIndex: number) => void;
}) {
  const icon = view.rewardKind === 'diamond' ? '💎' : '📦';
  const lvLabel = (l: number) => (view.passType === 'enhance' ? `+${l}` : `✦${l}`);
  const nextTier = Math.floor(view.maxReached / view.tierStep) * view.tierStep + view.tierStep;

  const freeVariant = (l: number) =>
    isClaimed('free', 0, l) ? 'claimed' : l > view.maxReached ? 'locked' : 'claimable';

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="mb-1.5 flex items-baseline gap-1">
        <span className="text-[13px]">{icon}</span>
        <span className="text-[12px] font-extrabold">
          {view.passType === 'enhance' ? '강화 패스' : '초월 패스'}
        </span>
        <span className="ml-auto text-[10px] font-bold tabular-nums text-amber-600 dark:text-amber-400">
          {view.maxReached >= 1 ? lvLabel(view.maxReached) : '—'}
        </span>
      </div>
      <div className={`${GRID} px-0.5 pb-1 text-center text-[8px] font-semibold text-zinc-400`}>
        <span>단계</span>
        <span>무료</span>
        <span>프리미엄</span>
      </div>

      <div className="flex-1">
        {view.segments.map((s) => {
          const levels = allTierLevels(view, s);
          const first = levels[0] ?? s.startLevel;
          // 이 구간에서 지금 받을 수 있는 총량(무료 + 산 경우 프리미엄).
          let segClaimable = 0;
          for (const tl of tierLevels(view, s)) {
            if (!isClaimed('free', s.index, tl)) segClaimable += s.freePerTier;
            if (s.purchased && !isClaimed('premium', s.index, tl)) segClaimable += s.premiumPerTier;
          }
          return (
            <section key={s.index} className="mb-3">
              <div className="mb-1 flex items-center gap-1">
                <span className="rounded bg-zinc-100 px-1 py-0.5 text-[8px] font-bold tabular-nums text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                  {lvLabel(first)}~{lvLabel(s.endLevel)}
                </span>
                {s.purchased ? (
                  <span className="text-[8px] font-bold text-amber-600 dark:text-amber-400">
                    프리미엄✓
                  </span>
                ) : null}
              </div>
              <div className="relative">
                <div className="space-y-1">
                  {levels.map((tl) => {
                    const cur = tl === nextTier;
                    const fv = freeVariant(tl);
                    const pv = isClaimed('premium', s.index, tl)
                      ? 'claimed'
                      : tl > view.maxReached
                        ? 'locked'
                        : s.purchased
                          ? 'claimable'
                          : 'preview';
                    return (
                      <div key={tl} className={`${GRID} items-center`}>
                        <span
                          className={`truncate text-center text-[9px] font-semibold leading-none tabular-nums ${
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
                          variant={fv}
                          onClick={fv === 'claimable' ? () => onClaimTier('free', tl, s) : undefined}
                        />
                        <RewardChip
                          icon={icon}
                          amount={s.premiumPerTier}
                          variant={pv}
                          onClick={
                            pv === 'claimable' ? () => onClaimTier('premium', tl, s) : undefined
                          }
                        />
                      </div>
                    );
                  })}
                </div>
                {/* 미결제 — 프리미엄 컬럼(보상 보이는 채로) 위에 연한 dim 오버레이 + 가격 */}
                {!s.purchased ? (
                  <button
                    type="button"
                    onClick={() => onPremiumLocked(view.passType, s.index)}
                    style={{ width: PREMIUM_W }}
                    className="absolute inset-y-0 right-0 flex flex-col items-center justify-center gap-0.5 rounded bg-zinc-900/50 text-center text-[9px] font-bold leading-tight text-white backdrop-blur-[0.5px]"
                  >
                    <span>프리미엄</span>
                    <span className="tabular-nums">{won(s.priceKrw)}</span>
                  </button>
                ) : null}
              </div>

              {/* 구간(티어) 하단 — 그 구간에서 받을 수 있는 만큼만 한번에 받기 */}
              <button
                type="button"
                disabled={segClaimable <= 0}
                onClick={() => onClaimSegment(s)}
                className="mt-1.5 w-full rounded-md bg-gradient-to-r from-amber-500 to-orange-500 py-1.5 text-[10px] font-extrabold text-amber-950 shadow-sm disabled:bg-none disabled:bg-zinc-200 disabled:text-zinc-400 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-500"
              >
                한번에 받기
                {segClaimable > 0 ? ` ${icon}${segClaimable.toLocaleString('ko-KR')}` : ''}
              </button>
            </section>
          );
        })}
      </div>
    </div>
  );
}

export function BattlePassClient({
  enhance,
  transcend,
  returnPaymentId = null,
  returnCode = null,
}: {
  enhance: BattlePassView;
  transcend: BattlePassView;
  /** 모바일 결제 복귀 — 포트원이 /battlepass?paymentId=…(&code=…)로 리다이렉트. 화면 내 검증. */
  returnPaymentId?: string | null;
  returnCode?: string | null;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [claimedKeys, setClaimedKeys] = useState<Set<string>>(new Set());
  const [paying, setPaying] = useState(false);
  const returnHandled = useRef(false);
  const { showHeaderToast } = useResourceToast();
  const { optimisticAdjust: adjustDiamond } = useDiamond();

  // 모바일 결제 복귀 — /battlepass?paymentId=…(&code=…)로 돌아오면 화면 내 검증·지급 확인 후 쿼리 정리.
  useEffect(() => {
    if (returnHandled.current) return;
    if (!returnPaymentId && !returnCode) return;
    returnHandled.current = true;
    window.history.replaceState(null, '', '/battlepass');
    if (returnCode) {
      if (returnCode !== 'PAY_CANCEL' && returnCode !== 'PAY_PROCESS_CANCELED') {
        setError('결제가 완료되지 않았습니다.');
      }
      return;
    }
    if (returnPaymentId) {
      void (async () => {
        const v = await verifyPurchaseAction(returnPaymentId);
        if (v.status === 'success') {
          router.refresh();
          showHeaderToast({ title: v.already ? '이미 처리된 결제입니다' : '성장패스 구매 완료' });
        } else {
          setError('결제 확인에 실패했습니다.');
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 프리미엄 구간 결제 — 주문 생성 → 결제창 → 검증·해금(소급). 모바일은 /battlepass 복귀 후 위 useEffect가 처리.
  const onBuyPremium = (passType: BattlePassType, segmentIndex: number) => {
    if (paying) return;
    setError(null);
    setPaying(true);
    void (async () => {
      const r = await runCheckout(`bp_${passType}_${segmentIndex}`, `${window.location.origin}/battlepass`);
      setPaying(false);
      if (r.ok) {
        router.refresh();
        showHeaderToast({ title: r.already ? '이미 구매한 구간입니다' : '성장패스 구매 완료' });
      } else if (r.reason === 'cancel') {
        // 사용자 취소 — 조용히.
      } else {
        setError(
          r.code === 'ALREADY_PURCHASED'
            ? '이미 구매한 구간입니다.'
            : r.code === 'MINOR_LIMIT'
              ? '미성년 월 구매한도를 초과했습니다.'
              : '결제에 실패했습니다.',
        );
      }
    })();
  };

  const keyOf = (pass: BattlePassType, line: Line, segIndex: number, level: number) =>
    `${pass}:${line}:${segIndex}:${level}`;

  const makeIsClaimed = (view: BattlePassView) => {
    const freeSet = new Set(view.free.claimedTiers);
    return (line: Line, segIndex: number, level: number) => {
      if (claimedKeys.has(keyOf(view.passType, line, segIndex, level))) return true;
      if (line === 'free') return freeSet.has(level);
      const seg = view.segments.find((s) => s.index === segIndex);
      return seg ? seg.premiumClaimedTiers.includes(level) : false;
    };
  };

  // 낙관적 수령 — 즉시 UI 반영(로딩 없음), 서버 실패 시 롤백.
  const claimOptimistic = (
    view: BattlePassView,
    items: { line: Line; segIndex: number; level: number }[],
    amount: number,
    run: () => Promise<{ status: 'success' | 'error'; code?: string; message?: string }>,
  ) => {
    if (amount <= 0) return;
    const keys = items.map((it) => keyOf(view.passType, it.line, it.segIndex, it.level));
    setClaimedKeys((prev) => {
      const n = new Set(prev);
      keys.forEach((k) => n.add(k));
      return n;
    });
    if (view.rewardKind === 'diamond') adjustDiamond(BigInt(amount));
    showHeaderToast({
      title: '성장패스 보상',
      rewards: [{ icon: view.rewardKind === 'diamond' ? '💎' : '', amount }],
    });
    setError(null);
    startTransition(async () => {
      const r = await run();
      if (r.status === 'error') {
        setClaimedKeys((prev) => {
          const n = new Set(prev);
          keys.forEach((k) => n.delete(k));
          return n;
        });
        if (view.rewardKind === 'diamond') adjustDiamond(BigInt(-amount));
        if (r.code !== 'NOTHING_TO_CLAIM') setError(r.message ?? '오류');
      }
    });
  };

  const onClaimTier =
    (view: BattlePassView) => (line: Line, level: number, s: BattlePassSegmentView) => {
      const reward = line === 'free' ? s.freePerTier : s.premiumPerTier;
      claimOptimistic(view, [{ line, segIndex: s.index, level }], reward, () =>
        claimTierAction(view.passType, line, level, s.index),
      );
    };

  const onClaimSegment =
    (view: BattlePassView, isClaimed: ReturnType<typeof makeIsClaimed>) =>
    (s: BattlePassSegmentView) => {
      const items: { line: Line; segIndex: number; level: number }[] = [];
      let sum = 0;
      for (const l of tierLevels(view, s)) {
        if (!isClaimed('free', s.index, l)) {
          items.push({ line: 'free', segIndex: s.index, level: l });
          sum += s.freePerTier;
        }
        if (s.purchased && !isClaimed('premium', s.index, l)) {
          items.push({ line: 'premium', segIndex: s.index, level: l });
          sum += s.premiumPerTier;
        }
      }
      claimOptimistic(view, items, sum, () => claimSegmentAction(view.passType, s.index));
    };


  const cols = [enhance, transcend].map((view) => ({ view, isClaimed: makeIsClaimed(view) }));

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
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/65 via-black/35 to-black/65" />
          <div className="relative z-10 flex h-full items-center px-4">
            <h1 className="text-base font-extrabold text-white text-pixel-outline">성장패스</h1>
          </div>
        </div>
        {error ? (
          <p className="bg-amber-50 px-3 py-1 text-[11px] text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
            {error}
          </p>
        ) : null}
      </div>

      {/* ── 내부 스크롤 — 강화 | 초월 좌우 ── */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
        {/* 컨텐츠 영역 — flex-1 유지(짧아도 footer를 하단으로 밀어냄). 함께 스크롤. */}
        <div className="flex-1 px-3 py-3">
        <div className="flex gap-2.5">
          <PassColumn
            view={cols[0]!.view}
            isClaimed={cols[0]!.isClaimed}
            onClaimTier={onClaimTier(cols[0]!.view)}
            onClaimSegment={onClaimSegment(cols[0]!.view, cols[0]!.isClaimed)}
            onPremiumLocked={onBuyPremium}
          />
          <div className="w-px shrink-0 self-stretch bg-zinc-200 dark:bg-zinc-800" />
          <PassColumn
            view={cols[1]!.view}
            isClaimed={cols[1]!.isClaimed}
            onClaimTier={onClaimTier(cols[1]!.view)}
            onClaimSegment={onClaimSegment(cols[1]!.view, cols[1]!.isClaimed)}
            onPremiumLocked={onBuyPremium}
          />
        </div>
        </div>

        {/* 전자상거래법 표시 — 컨텐츠 패딩 영역 밖 전체폭, 컨텐츠와 함께 스크롤(사업자정보·약관·환불). */}
        <PublicFooter />
      </div>
    </div>
  );
}
