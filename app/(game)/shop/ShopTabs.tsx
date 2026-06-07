'use client';

import { useState, useTransition } from 'react';

import { assetUrl } from '@/lib/asset-versions';
import { useResourceToast, type HeaderReward } from '@/components/ResourceToast';
import { useDiamond } from '@/components/DiamondContext';

import { claimFreeAction } from './actions';
import type { FreeSlot } from '@/lib/game/shop/free';

/**
 * 상점 — 상단 프리미엄 배너 + 탭(일일/주간/월간/충전). 담백·컴팩트.
 * 각 카드 배경 = 테마 픽셀아트(object-cover 꽉 채움) + 어두운 오버레이(가독성).
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
    { id: 'd1', name: '주머니', krw: 1200, diamond: 290, boxes: 3 },
    { id: 'd2', name: '꾸러미', krw: 2500, diamond: 610, boxes: 7 },
    { id: 'd3', name: '금고', krw: 4900, diamond: 1200, boxes: 15 },
  ],
  weekly: [
    { id: 'w1', name: '주머니', krw: 4900, diamond: 1360, boxes: 18 },
    { id: 'w2', name: '꾸러미', krw: 9900, diamond: 2750, boxes: 40 },
    { id: 'w3', name: '금고', krw: 19900, diamond: 5550, boxes: 90 },
  ],
  monthly: [
    { id: 'm1', name: '주머니', krw: 9900, diamond: 3200, boxes: 55 },
    { id: 'm2', name: '꾸러미', krw: 19900, diamond: 6450, boxes: 120 },
    { id: 'm3', name: '금고', krw: 39900, diamond: 12900, boxes: 260 },
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
const CASH_IMG: Record<string, string> = {
  주머니: '/sprites/shop/pouch.png',
  꾸러미: '/sprites/shop/bundle.png',
  금고: '/sprites/shop/vault.png',
};
// reward(text)/diamond/boxes — 서버 FREE_REWARDS와 1:1(낙관적 반영용).
const FREE_DISPLAY: Record<
  FreeSlot,
  { period: string; reward: string; img: string; diamond: number; boxes: number }
> = {
  daily: { period: '매일', reward: '보급상자 1개', img: '/sprites/shop/box.png', diamond: 0, boxes: 1 },
  weekly: { period: '매주', reward: '💎200', img: '/sprites/shop/charge.png', diamond: 200, boxes: 0 },
  monthly: { period: '매월', reward: '💎500', img: '/sprites/shop/charge.png', diamond: 500, boxes: 0 },
  signup: { period: '', reward: '보급상자 10개', img: '/sprites/shop/box.png', diamond: 0, boxes: 10 },
};

const won = (n: number) => `₩${n.toLocaleString('ko-KR')}`;
const dia = (n: number) => `💎${n.toLocaleString('ko-KR')}`;
const DARK = 'bg-gradient-to-r from-zinc-950/92 via-zinc-950/76 to-zinc-950/62';

/** 테마 이미지를 카드 전체 배경으로 깐 카드 — onClick 있으면 버튼, 없으면 정적. */
function BgCard({
  img,
  overlay = DARK,
  onClick,
  children,
}: {
  img: string;
  overlay?: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  const inner = (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={assetUrl(img)}
        alt=""
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-[0.7]"
        style={{ imageRendering: 'pixelated' }}
      />
      <div className={`pointer-events-none absolute inset-0 ${overlay}`} />
      <div className="relative z-10 flex items-center gap-3 px-3.5 py-3">{children}</div>
    </>
  );
  const cls = 'relative block w-full overflow-hidden rounded-xl border border-white/10 text-left';
  return onClick ? (
    <li>
      <button type="button" onClick={onClick} className={`${cls} active:opacity-90`}>
        {inner}
      </button>
    </li>
  ) : (
    <li className={cls}>{inner}</li>
  );
}

function PaidItem({
  img,
  name,
  detail,
  price,
  onClick,
}: {
  img: string;
  name: string;
  detail: string;
  price: string;
  onClick: () => void;
}) {
  return (
    <BgCard img={img} onClick={onClick}>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-bold text-white">{name}</div>
        <div className="mt-0.5 text-[11px] tabular-nums text-zinc-300">{detail}</div>
      </div>
      <span className="shrink-0 text-[12px] font-bold tabular-nums text-white">{price}</span>
    </BgCard>
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
    <BgCard
      img={d.img}
      overlay="bg-gradient-to-r from-emerald-950/92 via-emerald-950/74 to-emerald-950/55"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[13px] font-bold text-white">
          무료
          {d.period ? <span className="text-[10px] font-medium text-emerald-300">{d.period}</span> : null}
        </div>
        <div className="mt-0.5 text-[11px] tabular-nums text-emerald-100/90">{d.reward}</div>
      </div>
      <button
        type="button"
        onClick={onClaim}
        disabled={!available || busy}
        className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold transition active:scale-95 ${
          available && !busy ? 'bg-emerald-500 text-white' : 'bg-zinc-700/80 text-zinc-400'
        }`}
      >
        {busy ? '수령 중…' : available ? '받기' : '받음'}
      </button>
    </BgCard>
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

  // 낙관적 수령 — 즉시 빨간점 제거 + 헤더 다이아 반영, 서버 실패 시 롤백.
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
      {/* 슬림 헤더 배너 */}
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
          onClick={soon}
          className="relative mb-3 block w-full overflow-hidden rounded-2xl border border-amber-500/40 text-left active:opacity-90"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={assetUrl('/sprites/shop/premium.png')}
            alt=""
            aria-hidden
            className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-[0.7]"
            style={{ imageRendering: 'pixelated' }}
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-amber-950/92 via-amber-950/72 to-amber-950/50" />
          <div className="relative z-10 flex items-center justify-between gap-2 px-4 py-3">
            <div className="min-w-0">
              <div className="text-[14px] font-extrabold text-amber-50">👑 성장 프리미엄</div>
              <div className="mt-0.5 text-[11px] tabular-nums text-amber-100/90">
                즉시 {dia(PREMIUM.instant.diamond)}·📦{PREMIUM.instant.boxes} + 매일{' '}
                {dia(PREMIUM.daily.diamond)}·📦{PREMIUM.daily.boxes} ×{PREMIUM.daily.days}
              </div>
              <div className="mt-0.5 text-[10px] tabular-nums text-amber-200/60">
                총 {dia(premiumTotal.diamond)}·📦{premiumTotal.boxes}
              </div>
            </div>
            <span className="shrink-0 text-[12px] font-bold tabular-nums text-amber-50">
              {won(PREMIUM.krw)}
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
            <PaidItem
              img="/sprites/shop/box.png"
              name="보급상자"
              detail={`보급상자 ${BOX[tab].boxes}개`}
              price={dia(BOX[tab].cost)}
              onClick={soon}
            />
            {CASH[tab].map((c) => (
              <PaidItem
                key={c.id}
                img={CASH_IMG[c.name] ?? '/sprites/shop/pouch.png'}
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
              <PaidItem
                key={d.id}
                img="/sprites/shop/charge.png"
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
