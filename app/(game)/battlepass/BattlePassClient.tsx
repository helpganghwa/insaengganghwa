'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import type { BattlePassView, BattlePassSegmentView } from '@/lib/game/battlepass';
import type { BattlePassType } from '@/lib/game/balance';
import { assetUrl } from '@/lib/asset-versions';
import { useResourceToast } from '@/components/ResourceToast';
import { useDiamond } from '@/components/DiamondContext';
import { PublicFooter } from '@/components/PublicFooter';
import { ModalShell } from '@/components/ModalShell';
import * as PortOne from '@portone/browser-sdk/v2';
import { runCheckout } from '@/app/(game)/shop/checkout';
import { verifyPurchaseAction } from '@/app/(game)/shop/actions';

import { verifyIdentityAction } from '../me/settings/identity-actions';

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
  payEnabled,
}: {
  view: BattlePassView;
  isClaimed: (line: Line, segIndex: number, level: number) => boolean;
  onClaimTier: (line: Line, level: number, s: BattlePassSegmentView) => void;
  onClaimSegment: (s: BattlePassSegmentView) => void;
  onPremiumLocked: (passType: BattlePassType, segmentIndex: number) => void;
  payEnabled: boolean;
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
                    disabled={!payEnabled}
                    onClick={() => onPremiumLocked(view.passType, s.index)}
                    style={{ width: PREMIUM_W }}
                    className="absolute inset-y-0 right-0 flex flex-col items-center justify-center gap-0.5 rounded bg-zinc-900/50 text-center text-[9px] font-bold leading-tight text-white backdrop-blur-[0.5px] disabled:cursor-default"
                  >
                    <span>프리미엄</span>
                    {payEnabled ? (
                      <span className="tabular-nums">{won(s.priceKrw)}</span>
                    ) : (
                      <span className="text-[8px] text-white/70">준비 중</span>
                    )}
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
  payEnabled,
  returnPaymentId = null,
  returnCode = null,
  identityStoreId,
  identityChannelKey,
}: {
  enhance: BattlePassView;
  transcend: BattlePassView;
  /** 포트원 설정 여부 — false면 프리미엄 결제 비활성('준비 중' 표시, 결제창 진입 차단). */
  payEnabled: boolean;
  /** 모바일 결제 복귀 — 포트원이 /battlepass?paymentId=…(&code=…)로 리다이렉트. 화면 내 검증. */
  returnPaymentId?: string | null;
  returnCode?: string | null;
  /** 본인인증(KG이니시스 통합인증) — 성장패스 내에서 바로 인증 진행(설정 이동 없이). */
  identityStoreId?: string;
  identityChannelKey?: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [claimedKeys, setClaimedKeys] = useState<Set<string>>(new Set());
  const [paying, setPaying] = useState(false);
  const returnHandled = useRef(false);
  const { showHeaderToast } = useResourceToast();
  const { optimisticAdjust: adjustDiamond } = useDiamond();
  const [identityPrompt, setIdentityPrompt] = useState(false); // 본인인증 필요 모달
  const [identityBusy, setIdentityBusy] = useState(false);
  const [identityErr, setIdentityErr] = useState<string | null>(null);

  // 성장패스 내 본인인증 — 설정 이동 없이 여기서 포트원 통합인증(KG이니시스) 진행. ShopTabs와 동일 패턴.
  const startIdentity = async () => {
    if (!identityStoreId || !identityChannelKey) {
      setIdentityPrompt(false);
      router.push('/me/settings');
      return;
    }
    setIdentityErr(null);
    setIdentityBusy(true);
    try {
      const res = await PortOne.requestIdentityVerification({
        storeId: identityStoreId,
        identityVerificationId: `idv-${crypto.randomUUID()}`,
        channelKey: identityChannelKey,
        redirectUrl: `${window.location.origin}/battlepass`,
      });
      // 모바일은 리다이렉트되어 여기 도달하지 않음(아래 useEffect에서 복귀 처리). PC는 res 반환.
      if (!res) return;
      if (res.code) {
        setIdentityBusy(false);
        setIdentityErr(res.message ?? '본인인증에 실패했습니다.');
        return;
      }
      const r = await verifyIdentityAction(res.identityVerificationId);
      setIdentityBusy(false);
      if (r.ok) {
        setIdentityPrompt(false);
        router.refresh(); // 인증 반영 후 다시 구매 시 통과.
      } else setIdentityErr(r.message);
    } catch (e) {
      setIdentityBusy(false);
      setIdentityErr((e as Error).message);
    }
  };

  // 모바일 본인인증 리다이렉트 복귀 — /battlepass?identityVerificationId=…(&code=…) 검증 처리.
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const id = sp.get('identityVerificationId');
    if (!id) return;
    window.history.replaceState({}, '', window.location.pathname); // 중복 처리 방지
    if (sp.get('code')) {
      setIdentityErr(sp.get('message') || '본인인증에 실패했습니다.');
      setIdentityPrompt(true);
      return;
    }
    setIdentityBusy(true);
    verifyIdentityAction(id)
      .then((r) => {
        setIdentityBusy(false);
        if (r.ok) {
          setIdentityPrompt(false);
          router.refresh();
        } else {
          setIdentityErr(r.message);
          setIdentityPrompt(true);
        }
      })
      .catch(() => {
        // 전송 실패 — busy 고착 시 모달 버튼이 영구 disabled.
        setIdentityBusy(false);
        setIdentityErr('본인인증 확인이 전송되지 않았어요. 다시 시도해 주세요.');
        setIdentityPrompt(true);
      });
  }, [router]);

  // 모바일 결제 복귀 — /battlepass?paymentId=…(&code=…)로 돌아오면 화면 내 검증·지급 확인 후 쿼리 정리.
  useEffect(() => {
    if (returnHandled.current) return;
    if (!returnPaymentId && !returnCode) return;
    returnHandled.current = true;
    window.history.replaceState(null, '', '/battlepass');
    if (returnCode) {
      if (returnCode !== 'PAY_CANCEL' && returnCode !== 'PAY_PROCESS_CANCELED') {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setError('결제가 완료되지 않았습니다.');
      }
      return;
    }
    if (returnPaymentId) {
      void (async () => {
        const v = await verifyPurchaseAction(returnPaymentId).catch(
          () => ({ status: 'error', code: 'NETWORK' }) as const,
        );
        if (v.status === 'success') {
          router.refresh();
          showHeaderToast({ title: '성장패스 구매 완료' });
        } else if (v.code === 'NETWORK') {
          setError('결제 확인 지연 — 지급은 잠시 후 자동 반영됩니다.');
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
    if (!payEnabled) return; // 결제 비활성 — '준비 중'. 결제창 진입 차단(서버 createOrder도 CONFIG로 거절).
    setError(null);
    setPaying(true);
    void (async () => {
      // 전송 실패도 흡수 — paying 고착 시 구매 버튼이 무반응이 된다.
      const r = await runCheckout(`bp_${passType}_${segmentIndex}`, `${window.location.origin}/battlepass`).catch(
        () => ({ ok: false, reason: 'create', code: 'NETWORK' }) as const,
      );
      setPaying(false);
      if (r.ok) {
        router.refresh();
        showHeaderToast({ title: '성장패스 구매 완료' });
      } else if (r.reason === 'cancel') {
        // 사용자 취소 — 조용히.
      } else if (r.code === 'IDENTITY_REQUIRED') {
        // 청소년보호 — 결제 전 본인인증 필수. 본인인증 유도 모달 노출.
        setIdentityPrompt(true);
      } else {
        setError(
          r.code === 'ALREADY_PURCHASED'
            ? '이미 구매한 구간입니다.'
            : r.code === 'MINOR_LIMIT'
              ? '미성년 월 구매한도를 초과했습니다.'
              : r.code === 'NETWORK'
                ? r.reason === 'verify'
                  ? '결제 확인이 지연되고 있어요 — 지급은 잠시 후 자동 반영됩니다.'
                  : '요청이 전송되지 않았어요. 연결을 확인해 주세요.'
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
        {/* 확률형 아이템 고지(법규 F-11) — 초월 패스 보상에 보급상자 포함, 구매 화면 인접 노출. */}
        <p className="mb-2 px-1 text-center text-[10px] leading-snug text-zinc-500">
          📦 보급상자는 확률형 아이템입니다 ·{' '}
          <Link href="/probability#supply" className="underline underline-offset-2">
            아이템별 확률 보기
          </Link>
        </p>
        <div className="flex gap-2.5">
          <PassColumn
            view={cols[0]!.view}
            isClaimed={cols[0]!.isClaimed}
            onClaimTier={onClaimTier(cols[0]!.view)}
            onClaimSegment={onClaimSegment(cols[0]!.view, cols[0]!.isClaimed)}
            onPremiumLocked={onBuyPremium}
            payEnabled={payEnabled}
          />
          <div className="w-px shrink-0 self-stretch bg-zinc-200 dark:bg-zinc-800" />
          <PassColumn
            view={cols[1]!.view}
            isClaimed={cols[1]!.isClaimed}
            onClaimTier={onClaimTier(cols[1]!.view)}
            onClaimSegment={onClaimSegment(cols[1]!.view, cols[1]!.isClaimed)}
            onPremiumLocked={onBuyPremium}
            payEnabled={payEnabled}
          />
        </div>
        </div>

        {/* 전자상거래법 표시 — 컨텐츠 패딩 영역 밖 전체폭, 컨텐츠와 함께 스크롤(사업자정보·약관·환불). */}
        <PublicFooter />
      </div>

      {/* 본인인증 필요 — 청소년보호(결제 전 본인인증). ShopTabs와 동일 모달. */}
      {identityPrompt ? (
        <ModalShell
          onClose={() => setIdentityPrompt(false)}
          label="본인인증 필요"
          className="w-full max-w-[300px] rounded-2xl bg-white p-5 dark:bg-zinc-950"
        >
          <h2 className="text-base font-bold">본인인증이 필요합니다</h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-500 dark:text-zinc-400">
            청소년 보호를 위해 유료 결제 전 본인인증이 필요합니다. 설정에서 본인인증을 완료한 뒤 다시
            시도해 주세요.
          </p>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => setIdentityPrompt(false)}
              disabled={identityBusy}
              className="flex-1 rounded-lg bg-zinc-100 py-2.5 text-sm font-bold text-zinc-700 active:opacity-70 disabled:opacity-50 dark:bg-zinc-800 dark:text-zinc-200"
            >
              취소
            </button>
            <button
              type="button"
              onClick={startIdentity}
              disabled={identityBusy}
              className="flex-1 rounded-lg bg-zinc-900 py-2.5 text-sm font-bold text-white active:opacity-90 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {identityBusy ? '진행 중…' : '본인인증 하기'}
            </button>
          </div>
          {identityErr ? (
            <p className="mt-2 text-center text-[12px] text-red-500">{identityErr}</p>
          ) : null}
        </ModalShell>
      ) : null}
    </div>
  );
}
