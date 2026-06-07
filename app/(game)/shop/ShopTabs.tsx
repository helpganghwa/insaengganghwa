'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { assetUrl } from '@/lib/asset-versions';

import { claimFreeAction } from './actions';
import type { FreeSlot } from '@/lib/game/shop/free';

/**
 * 상점 — 상단 프리미엄 배너 + 탭(일일/주간/월간/충전). 담백·컴팩트.
 * 각 탭 최상단에 무료 수령(주기 멱등·결제 불필요) — 수령 가능하면 탭에 빨간 점.
 * 현금/박스 상품은 결제 백엔드 연동 전 '준비 중'. 수치는 시작값(시뮬 후 조정).
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
// 무료 수령 표시(슬롯별). 보상은 free.ts FREE_REWARDS와 1:1.
const FREE_DISPLAY: Record<FreeSlot, { period: string; reward: string; img: string }> = {
  daily: { period: '매일', reward: '보급상자 1개', img: '/sprites/shop/box.png' },
  weekly: { period: '매주', reward: '💎200', img: '/sprites/shop/charge.png' },
  monthly: { period: '매월', reward: '💎500', img: '/sprites/shop/charge.png' },
  signup: { period: '가입 1회', reward: '보급상자 10개', img: '/sprites/shop/box.png' },
};

const won = (n: number) => `₩${n.toLocaleString('ko-KR')}`;
const dia = (n: number) => `💎${n.toLocaleString('ko-KR')}`;

function Soon() {
  return (
    <button
      type="button"
      disabled
      className="shrink-0 rounded-full bg-zinc-200/80 px-3 py-1.5 text-[11px] font-bold text-zinc-500 dark:bg-zinc-800"
    >
      준비 중
    </button>
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
    <li className="relative flex items-center gap-3 overflow-hidden rounded-xl border border-emerald-300 bg-emerald-50/60 px-3.5 py-2.5 dark:border-emerald-800/50 dark:bg-emerald-950/20">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={assetUrl(d.img)}
        alt=""
        className="relative z-10 h-9 w-9 shrink-0 object-contain"
        style={{ imageRendering: 'pixelated' }}
      />
      <div className="relative z-10 min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[13px] font-bold">
          무료
          <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">{d.period}</span>
        </div>
        <div className="mt-0.5 text-[11px] tabular-nums text-zinc-500">{d.reward}</div>
      </div>
      <button
        type="button"
        onClick={onClaim}
        disabled={!available || busy}
        className={`relative z-10 shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold transition active:scale-95 ${
          available && !busy ? 'bg-emerald-500 text-white' : 'bg-zinc-200 text-zinc-500 dark:bg-zinc-800'
        }`}
      >
        {busy ? '수령 중…' : available ? '받기' : '받음'}
      </button>
    </li>
  );
}

function Item({ img, name, detail, price }: { img: string; name: string; detail: string; price: string }) {
  const src = assetUrl(img);
  return (
    <li className="relative flex items-center gap-3 overflow-hidden rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 dark:border-zinc-800 dark:bg-zinc-950">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        aria-hidden
        className="pointer-events-none absolute -right-2 top-1/2 h-[210%] w-auto -translate-y-1/2 object-contain opacity-[0.13]"
        style={{ imageRendering: 'pixelated' }}
      />
      <div className="absolute inset-0 bg-gradient-to-r from-white via-white/85 to-transparent dark:from-zinc-950 dark:via-zinc-950/80" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="relative z-10 h-9 w-9 shrink-0 object-contain" style={{ imageRendering: 'pixelated' }} />
      <div className="relative z-10 min-w-0 flex-1">
        <div className="text-[13px] font-bold">{name}</div>
        <div className="mt-0.5 text-[11px] tabular-nums text-zinc-500">{detail}</div>
      </div>
      <div className="relative z-10 flex shrink-0 flex-col items-end gap-1">
        <span className="text-[12px] font-bold tabular-nums">{price}</span>
        <Soon />
      </div>
    </li>
  );
}

export function ShopTabs({
  verified,
  free: initialFree,
}: {
  verified: boolean;
  free: Record<FreeSlot, boolean>;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('daily');
  const [free, setFree] = useState(initialFree);
  const [claiming, setClaiming] = useState<FreeSlot | null>(null);
  const [, startTransition] = useTransition();

  const claimFreeSlot = (slot: FreeSlot) => {
    if (claiming || !free[slot]) return;
    setClaiming(slot);
    startTransition(async () => {
      const r = await claimFreeAction(slot);
      if (r.status === 'success') {
        setFree((f) => ({ ...f, [slot]: false }));
        router.refresh(); // 헤더 다이아·상태 갱신
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
        <div className="relative mb-3 overflow-hidden rounded-2xl border border-amber-300 bg-gradient-to-r from-amber-100/70 to-amber-50/20 px-4 py-3 dark:border-amber-700/50 dark:from-amber-950/40 dark:to-amber-950/10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={assetUrl('/sprites/shop/premium.png')}
            alt=""
            aria-hidden
            className="pointer-events-none absolute -right-2 top-1/2 h-[150%] w-auto -translate-y-1/2 object-contain opacity-30 drop-shadow-[0_0_10px_rgba(245,158,11,0.4)]"
            style={{ imageRendering: 'pixelated' }}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-amber-50/70 via-amber-50/30 to-transparent dark:from-amber-950/40 dark:via-amber-950/10" />
          <div className="relative z-10 flex items-center justify-between gap-2">
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
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span className="text-[12px] font-bold tabular-nums">{won(PREMIUM.krw)}</span>
              <Soon />
            </div>
          </div>
        </div>

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

        {/* 탭 내용 — 최상단 무료 수령 + 상품 */}
        {tab !== 'charge' ? (
          <ul className="space-y-2">
            <FreeRow
              slot={tab}
              available={free[tab]}
              busy={claiming === tab}
              onClaim={() => claimFreeSlot(tab)}
            />
            <Item
              img="/sprites/shop/box.png"
              name="보급상자"
              detail={`보급상자 ${BOX[tab].boxes}개`}
              price={dia(BOX[tab].cost)}
            />
            {CASH[tab].map((c) => (
              <Item
                key={c.id}
                img={CASH_IMG[c.name] ?? '/sprites/shop/pouch.png'}
                name={c.name}
                detail={`${dia(c.diamond)} · 📦${c.boxes}`}
                price={won(c.krw)}
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
            {!verified ? (
              <li className="rounded-xl border border-dashed border-zinc-300 px-3 py-2 text-[11px] leading-relaxed text-zinc-500 dark:border-zinc-700">
                최초 결제 시 휴대폰 본인인증이 필요합니다.
              </li>
            ) : null}
            {DIAMONDS.map((d) => (
              <Item
                key={d.id}
                img="/sprites/shop/charge.png"
                name={dia(d.total)}
                detail="다이아 충전"
                price={won(d.krw)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
