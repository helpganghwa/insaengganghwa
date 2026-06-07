'use client';

import { useState, useTransition } from 'react';

import { useResourceToast, type HeaderReward } from '@/components/ResourceToast';
import { useDiamond } from '@/components/DiamondContext';

import { claimFreeAction } from './actions';
import type { FreeSlot } from '@/lib/game/shop/free';

/**
 * 상점 — 상단 프리미엄 배너 + 탭(일일/주간/월간/충전). CSS-only(배경 이미지 없음)·담백.
 * 각 탭 최상단 무료 수령(주기 멱등·결제 불필요) — 수령 가능 시 탭 빨간점.
 * 유료/박스 상품은 결제 연동 전 — 클릭 시 '준비 중입니다' 토스트. 수치는 시작값.
 */
type Tab = 'daily' | 'weekly' | 'monthly' | 'charge';
const TABS: { key: Tab; label: string; free: FreeSlot }[] = [
  { key: 'daily', label: '일일', free: 'daily' },
  { key: 'weekly', label: '주간', free: 'weekly' },
  { key: 'monthly', label: '월간', free: 'monthly' },
  { key: 'charge', label: '충전', free: 'signup' },
];

type Period = 'daily' | 'weekly' | 'monthly';
const BOX: Record<Period, { cost: number; boxes: number }> = {
  daily: { cost: 200, boxes: 8 },
  weekly: { cost: 1200, boxes: 60 },
  monthly: { cost: 4000, boxes: 240 },
};
type Cash = { id: string; name: string; krw: number; diamond: number; boxes: number };
const CASH: Record<Period, Cash[]> = {
  daily: [
    { id: 'd1', name: '모험가의 자루', krw: 1200, diamond: 290, boxes: 3 },
    { id: 'd2', name: '기사의 상자', krw: 2500, diamond: 610, boxes: 7 },
    { id: 'd3', name: '왕의 금고', krw: 4900, diamond: 1200, boxes: 15 },
  ],
  weekly: [
    { id: 'w1', name: '모험가의 자루', krw: 4900, diamond: 1360, boxes: 18 },
    { id: 'w2', name: '기사의 상자', krw: 9900, diamond: 2750, boxes: 40 },
    { id: 'w3', name: '왕의 금고', krw: 19900, diamond: 5550, boxes: 90 },
  ],
  monthly: [
    { id: 'm1', name: '모험가의 자루', krw: 9900, diamond: 3200, boxes: 55 },
    { id: 'm2', name: '기사의 상자', krw: 19900, diamond: 6450, boxes: 120 },
    { id: 'm3', name: '왕의 금고', krw: 39900, diamond: 12900, boxes: 260 },
  ],
};
const PREMIUM = {
  krw: 29900,
  instant: { diamond: 4000, boxes: 30 },
  daily: { diamond: 300, boxes: 3, days: 30 },
};
const DIAMONDS = [
  { id: 'starter', total: 300, krw: 1500 },
  { id: 'small', total: 1200, krw: 6000 },
  { id: 'medium', total: 2800, krw: 13000 },
  { id: 'large', total: 6400, krw: 28000 },
  { id: 'mega', total: 16000, krw: 68000 },
];
const FREE_DISPLAY: Record<
  FreeSlot,
  { period: string; reward: string; icon: string; diamond: number; boxes: number }
> = {
  daily: { period: '매일', reward: '보급상자 1개', icon: '📦', diamond: 0, boxes: 1 },
  weekly: { period: '매주', reward: '💎200', icon: '💎', diamond: 200, boxes: 0 },
  monthly: { period: '매월', reward: '💎500', icon: '💎', diamond: 500, boxes: 0 },
  signup: { period: '', reward: '보급상자 10개', icon: '📦', diamond: 0, boxes: 10 },
};

const won = (n: number) => `₩${n.toLocaleString('ko-KR')}`;
const dia = (n: number) => `💎${n.toLocaleString('ko-KR')}`;

/** 결제 대기 상품 카드 — 클릭 시 '준비 중' 토스트. */
function PaidCard({
  icon,
  name,
  detail,
  price,
  onClick,
}: {
  icon: string;
  name: string;
  detail: string;
  price: string;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-3 rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-left transition active:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/50 dark:active:bg-zinc-900"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-lg dark:bg-zinc-800">
          {icon}
        </span>
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
  return (
    <li className="flex items-center gap-3 rounded-xl border border-emerald-300 bg-emerald-50/70 px-3.5 py-2.5 dark:border-emerald-800/60 dark:bg-emerald-950/25">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-lg">
        {d.icon}
      </span>
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
      <button
        type="button"
        onClick={onClaim}
        disabled={!available || busy}
        className={`shrink-0 rounded-full px-3.5 py-1.5 text-[11px] font-bold transition active:scale-95 ${
          available && !busy
            ? 'bg-emerald-500 text-white'
            : 'bg-zinc-200 text-zinc-400 dark:bg-zinc-800'
        }`}
      >
        {busy ? '수령 중…' : available ? '받기' : '받음'}
      </button>
    </li>
  );
}

export function ShopTabs({ free: initialFree }: { free: Record<FreeSlot, boolean> }) {
  const { showHeaderToast } = useResourceToast();
  const { optimisticAdjust } = useDiamond();
  const [tab, setTab] = useState<Tab>('daily');
  const [free, setFree] = useState(initialFree);
  const [claiming, setClaiming] = useState<FreeSlot | null>(null);
  const [, startTransition] = useTransition();

  const soon = () => showHeaderToast({ icon: '🛒', title: '준비 중입니다' });

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

  const premiumTotal = {
    diamond: PREMIUM.instant.diamond + PREMIUM.daily.diamond * PREMIUM.daily.days,
    boxes: PREMIUM.instant.boxes + PREMIUM.daily.boxes * PREMIUM.daily.days,
  };

  return (
    <div className="flex h-full flex-col">
      {/* CSS 헤더 — 이미지 없음, 앰버 글로우 액센트 */}
      <div className="relative h-14 shrink-0 overflow-hidden border-b border-zinc-200 bg-gradient-to-r from-zinc-100 to-white dark:border-zinc-800 dark:from-zinc-900 dark:to-zinc-950">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_85%_30%,rgba(245,158,11,0.18),transparent_55%)]" />
        <div className="relative flex h-full items-center px-4">
          <h1 className="text-base font-extrabold">🛒 상점</h1>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
        {/* 프리미엄 상단 배너 — CSS 그라데이션 */}
        <button
          type="button"
          onClick={soon}
          className="mb-3 block w-full overflow-hidden rounded-2xl border border-amber-400/60 bg-gradient-to-br from-amber-100 to-amber-50 px-4 py-3 text-left shadow-[0_0_20px_rgba(245,158,11,0.12)] transition active:opacity-90 dark:border-amber-600/50 dark:from-amber-950/50 dark:to-zinc-950"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[14px] font-extrabold">👑 성장 프리미엄</div>
              <div className="mt-0.5 text-[11px] tabular-nums text-zinc-600 dark:text-zinc-300">
                즉시 {dia(PREMIUM.instant.diamond)}·📦{PREMIUM.instant.boxes} + 매일{' '}
                {dia(PREMIUM.daily.diamond)}·📦{PREMIUM.daily.boxes} ×{PREMIUM.daily.days}
              </div>
              <div className="mt-0.5 text-[10px] tabular-nums text-zinc-400">
                총 {dia(premiumTotal.diamond)}·📦{premiumTotal.boxes}
              </div>
            </div>
            <span className="shrink-0 text-[12px] font-bold tabular-nums">{won(PREMIUM.krw)}</span>
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
              icon="📦"
              name="견습의 주머니"
              detail={`보급상자 ${BOX[tab].boxes}개`}
              price={dia(BOX[tab].cost)}
              onClick={soon}
            />
            {CASH[tab].map((c) => (
              <PaidCard
                key={c.id}
                icon="💎"
                name={c.name}
                detail={`${dia(c.diamond)} · 📦${c.boxes}`}
                price={won(c.krw)}
                onClick={soon}
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
                icon="💎"
                name={dia(d.total)}
                detail="다이아 충전"
                price={won(d.krw)}
                onClick={soon}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
