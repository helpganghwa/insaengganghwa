'use client';

import { useState, useTransition } from 'react';

import { assetUrl } from '@/lib/asset-versions';
import { useResourceToast, type HeaderReward } from '@/components/ResourceToast';
import { useDiamond } from '@/components/DiamondContext';

import { claimFreeAction, devPurchaseAction } from './actions';
import type { FreeSlot } from '@/lib/game/shop/free';
import { BOX, CASH, PREMIUM, PREMIUM_TOTAL, DIAMONDS, productPeriod } from '@/lib/game/shop/catalog';

/**
 * 상점 — 상단 배너 + 탭(일일/주간/월간/충전). 담백.
 * 각 탭 최상단 무료 수령(주기 멱등·결제 불필요) — 수령 가능 시 탭 빨간점.
 * 유료 상품: 일반 유저는 클릭 시 '준비 중' 토스트, 어드민은 테스트 즉시 구매(결제 없이 지급).
 * 일일/주간/월간 상품은 그 기간 1회만 — 구매하면 '구매함'(비활성). 수치는 시작값.
 */
type Tab = 'daily' | 'weekly' | 'monthly' | 'charge';
const TABS: { key: Tab; label: string; free: FreeSlot }[] = [
  { key: 'daily', label: '일일', free: 'daily' },
  { key: 'weekly', label: '주간', free: 'weekly' },
  { key: 'monthly', label: '월간', free: 'monthly' },
  { key: 'charge', label: '충전', free: 'signup' },
];

const FREE_DISPLAY: Record<
  FreeSlot,
  { period: string; reward: string; diamond: number; boxes: number }
> = {
  daily: { period: '매일', reward: '📦 1개', diamond: 0, boxes: 1 },
  weekly: { period: '매주', reward: '💎200', diamond: 200, boxes: 0 },
  monthly: { period: '매월', reward: '💎500', diamond: 500, boxes: 0 },
  signup: { period: '', reward: '📦 10개', diamond: 0, boxes: 10 },
};

const won = (n: number) => `₩${n.toLocaleString('ko-KR')}`;
const dia = (n: number) => `💎${n.toLocaleString('ko-KR')}`;

function PaidCard({
  name,
  detail,
  price,
  onClick,
  purchased,
}: {
  name: string;
  detail: string;
  price: string;
  onClick: () => void;
  purchased?: boolean;
}) {
  if (purchased) {
    return (
      <li className="flex w-full items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50/70 px-3.5 py-2.5 opacity-70 dark:border-zinc-800 dark:bg-zinc-900/30">
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-bold">{name}</div>
          <div className="mt-0.5 text-[11px] tabular-nums text-zinc-500">{detail}</div>
        </div>
        <span className="shrink-0 rounded-full bg-zinc-200 px-2.5 py-1 text-[10px] font-bold text-zinc-500 dark:bg-zinc-800">
          구매함
        </span>
      </li>
    );
  }
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-3 rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-left transition active:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/50 dark:active:bg-zinc-900"
      >
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-bold">{name}</div>
          <div className="mt-0.5 text-[11px] tabular-nums text-zinc-500">{detail}</div>
        </div>
        <span className="shrink-0 text-[12px] font-bold tabular-nums text-zinc-700 dark:text-zinc-200">
          {price}
        </span>
        <span className="shrink-0 text-zinc-300 dark:text-zinc-600">›</span>
      </button>
    </li>
  );
}

function FreeRow({
  slot,
  available,
  busy,
  onClaim,
}: {
  slot: FreeSlot;
  available: boolean;
  busy: boolean;
  onClaim: () => void;
}) {
  const d = FREE_DISPLAY[slot];
  const clickable = available && !busy;
  return (
    <li>
      <button
        type="button"
        onClick={clickable ? onClaim : undefined}
        disabled={!clickable}
        className={`flex w-full items-center gap-3 rounded-xl border border-emerald-300 bg-emerald-50/70 px-3.5 py-2.5 text-left transition dark:border-emerald-800/60 dark:bg-emerald-950/25 ${
          clickable ? 'active:bg-emerald-100 dark:active:bg-emerald-900/40' : 'opacity-80'
        }`}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[13px] font-bold">
            무료
            {d.period ? (
              <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                {d.period}
              </span>
            ) : null}
          </div>
          <div className="mt-0.5 text-[11px] tabular-nums text-zinc-500">{d.reward}</div>
        </div>
        <span
          className={`shrink-0 text-[12px] font-bold ${
            available ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-400'
          }`}
        >
          {busy ? '수령 중…' : available ? '받기' : '받음'}
        </span>
        {clickable ? <span className="shrink-0 text-emerald-400">›</span> : null}
      </button>
    </li>
  );
}

export function ShopTabs({
  free: initialFree,
  isAdmin,
  purchased: initialPurchased,
}: {
  free: Record<FreeSlot, boolean>;
  isAdmin: boolean;
  purchased: string[];
}) {
  const { showHeaderToast } = useResourceToast();
  const { optimisticAdjust } = useDiamond();
  const [tab, setTab] = useState<Tab>('daily');
  const [free, setFree] = useState(initialFree);
  const [claiming, setClaiming] = useState<FreeSlot | null>(null);
  const [purchased, setPurchased] = useState<Set<string>>(() => new Set(initialPurchased));
  const [, startTransition] = useTransition();

  const soon = () => showHeaderToast({ icon: '🛒', title: '준비 중입니다' });
  const isLimited = (id: string) => productPeriod(id) !== null;

  // 어드민: 결제 단계 없이 테스트 즉시 구매(바로 지급). 일반 유저: '준비 중' 토스트.
  const onBuy = (productId: string) => {
    if (!isAdmin) {
      soon();
      return;
    }
    if (isLimited(productId) && purchased.has(productId)) {
      showHeaderToast({ icon: '🛒', title: '이번 기간에 이미 구매했습니다' });
      return;
    }
    startTransition(async () => {
      const r = await devPurchaseAction(productId);
      if (r.status === 'success') {
        if (r.diamond) optimisticAdjust(BigInt(r.diamond));
        const rewards: HeaderReward[] = [];
        if (r.diamond) rewards.push({ icon: '💎', amount: r.diamond });
        if (r.boxes) rewards.push({ icon: '📦', amount: r.boxes });
        showHeaderToast({ icon: '🧪', title: '테스트 구매', rewards });
        if (isLimited(productId)) setPurchased((p) => new Set(p).add(productId));
      } else if (r.code === 'ALREADY_PURCHASED') {
        setPurchased((p) => new Set(p).add(productId));
        showHeaderToast({ icon: '🛒', title: '이번 기간에 이미 구매했습니다' });
      } else {
        showHeaderToast({ icon: '⚠️', title: '구매 실패' });
      }
    });
  };

  const claimFreeSlot = (slot: FreeSlot) => {
    if (claiming || !free[slot]) return;
    const d = FREE_DISPLAY[slot];
    setClaiming(slot);
    setFree((f) => ({ ...f, [slot]: false }));
    if (d.diamond) optimisticAdjust(BigInt(d.diamond));
    startTransition(async () => {
      const r = await claimFreeAction(slot);
      if (r.status === 'success') {
        const rewards: HeaderReward[] = [];
        if (d.diamond) rewards.push({ icon: '💎', amount: d.diamond });
        if (d.boxes) rewards.push({ icon: '📦', amount: d.boxes });
        showHeaderToast({ icon: '🎁', title: '무료 수령', rewards });
      } else {
        setFree((f) => ({ ...f, [slot]: true }));
        if (d.diamond) optimisticAdjust(BigInt(-d.diamond));
        showHeaderToast({
          icon: '⚠️',
          title: r.code === 'ALREADY_CLAIMED' ? '이미 수령했습니다' : '수령 실패',
        });
      }
      setClaiming(null);
    });
  };

  const premiumBought = purchased.has(PREMIUM.id);

  return (
    <div className="flex h-full flex-col">
      {/* 헤더 배너 — 상점 hub 이미지 */}
      <div className="relative h-14 shrink-0 overflow-hidden border-b border-zinc-200 dark:border-zinc-800">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={assetUrl('/sprites/hub/shop.png')}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover object-center"
          style={{ imageRendering: 'pixelated' }}
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/65 via-black/35 to-black/65" />
        <div className="relative z-10 flex h-full items-center px-4">
          <h1 className="text-base font-extrabold text-white text-pixel-outline">상점</h1>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
        {/* 프리미엄 상단 배너 */}
        <button
          type="button"
          onClick={() => onBuy(PREMIUM.id)}
          className={`mb-3 block w-full overflow-hidden rounded-2xl border border-amber-400/60 bg-gradient-to-br from-amber-100 to-amber-50 px-4 py-3 text-left shadow-[0_0_20px_rgba(245,158,11,0.12)] transition active:opacity-90 dark:border-amber-600/50 dark:from-amber-950/50 dark:to-zinc-950 ${
            premiumBought ? 'opacity-70' : ''
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[14px] font-extrabold">👑 성장 프리미엄</div>
              <div className="mt-0.5 text-[11px] tabular-nums text-zinc-600 dark:text-zinc-300">
                즉시 {dia(PREMIUM.instant.diamond)}·📦{PREMIUM.instant.boxes} + 매일{' '}
                {dia(PREMIUM.daily.diamond)}·📦{PREMIUM.daily.boxes} ×{PREMIUM.daily.days}
              </div>
              <div className="mt-0.5 text-[10px] tabular-nums text-zinc-400">
                총 {dia(PREMIUM_TOTAL.diamond)}·📦{PREMIUM_TOTAL.boxes}
              </div>
            </div>
            <span className="shrink-0 text-[12px] font-bold tabular-nums">
              {premiumBought ? '구매함' : won(PREMIUM.krw)}
            </span>
          </div>
        </button>

        {/* 탭 */}
        <div className="mb-3 flex gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-900">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`relative flex-1 rounded-lg py-1.5 text-[12px] font-bold transition ${
                tab === t.key
                  ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-white'
                  : 'text-zinc-500'
              }`}
            >
              {t.label}
              {free[t.free] ? (
                <span className="absolute right-1.5 top-1 h-1.5 w-1.5 rounded-full bg-red-500" />
              ) : null}
            </button>
          ))}
        </div>

        {/* 탭 내용 */}
        {tab !== 'charge' ? (
          <ul className="space-y-2">
            <FreeRow
              slot={tab}
              available={free[tab]}
              busy={claiming === tab}
              onClaim={() => claimFreeSlot(tab)}
            />
            <PaidCard
              name="견습의 주머니"
              detail={`📦 ${BOX[tab].boxes}개`}
              price={dia(BOX[tab].cost)}
              onClick={soon}
            />
            {CASH[tab].map((c) => (
              <PaidCard
                key={c.id}
                name={c.name}
                detail={`${dia(c.diamond)} · 📦${c.boxes}`}
                price={won(c.krw)}
                onClick={() => onBuy(c.id)}
                purchased={purchased.has(c.id)}
              />
            ))}
          </ul>
        ) : (
          <ul className="space-y-2">
            <FreeRow
              slot="signup"
              available={free.signup}
              busy={claiming === 'signup'}
              onClaim={() => claimFreeSlot('signup')}
            />
            {DIAMONDS.map((d) => (
              <PaidCard
                key={d.id}
                name={dia(d.total)}
                detail="다이아 충전"
                price={won(d.krw)}
                onClick={() => onBuy(d.id)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
