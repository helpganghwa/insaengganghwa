'use client';

import { useState } from 'react';

import { assetUrl } from '@/lib/asset-versions';

/**
 * 상점 — 탭형(일일/주간/월간/프리미엄/충전). 담백·컴팩트(성장패스 톤).
 * 결제 백엔드 연동 전 — 전 상품 '준비 중'. 수치는 시작값(시뮬 후 조정).
 */
type Tab = 'daily' | 'weekly' | 'monthly' | 'premium' | 'charge';
const TABS: { key: Tab; label: string }[] = [
  { key: 'daily', label: '일일' },
  { key: 'weekly', label: '주간' },
  { key: 'monthly', label: '월간' },
  { key: 'premium', label: '프리미엄' },
  { key: 'charge', label: '충전' },
];

type Period = 'daily' | 'weekly' | 'monthly';
// 💎로 사는 보급상자(기간별 1종).
const BOX: Record<Period, { cost: number; boxes: number }> = {
  daily: { cost: 200, boxes: 8 },
  weekly: { cost: 1200, boxes: 60 },
  monthly: { cost: 4000, boxes: 240 },
};
// 현금 3종(💎+📦) — 이름: 주머니/꾸러미/금고.
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

function Item({
  icon,
  name,
  detail,
  price,
}: {
  icon: string;
  name: string;
  detail: string;
  price: string;
}) {
  return (
    <li className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 dark:border-zinc-800 dark:bg-zinc-950">
      <span className="text-xl leading-none">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-bold">{name}</div>
        <div className="mt-0.5 text-[11px] tabular-nums text-zinc-500">{detail}</div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="text-[12px] font-bold tabular-nums">{price}</span>
        <Soon />
      </div>
    </li>
  );
}

function PeriodList({ period }: { period: Period }) {
  const box = BOX[period];
  return (
    <ul className="space-y-2">
      <Item icon="📦" name="보급상자" detail={`보급상자 ${box.boxes}개`} price={dia(box.cost)} />
      {CASH[period].map((c) => (
        <Item
          key={c.id}
          icon="💎"
          name={c.name}
          detail={`${dia(c.diamond)} · 📦${c.boxes}`}
          price={won(c.krw)}
        />
      ))}
    </ul>
  );
}

export function ShopTabs({ verified }: { verified: boolean }) {
  const [tab, setTab] = useState<Tab>('daily');
  const premiumTotal = {
    diamond: PREMIUM.instant.diamond + PREMIUM.daily.diamond * PREMIUM.daily.days,
    boxes: PREMIUM.instant.boxes + PREMIUM.daily.boxes * PREMIUM.daily.days,
  };

  return (
    <div className="flex h-full flex-col">
      {/* 슬림 헤더 배너 */}
      <div className="relative h-16 shrink-0 overflow-hidden border-b border-zinc-200 dark:border-zinc-800">
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

      {/* 탭 */}
      <div className="shrink-0 px-3 pt-3">
        <div className="flex gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-900">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`flex-1 rounded-lg py-1.5 text-[12px] font-bold transition ${
                tab === t.key
                  ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-white'
                  : 'text-zinc-500'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* 내용 */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
        {tab === 'daily' || tab === 'weekly' || tab === 'monthly' ? <PeriodList period={tab} /> : null}

        {tab === 'premium' ? (
          <div className="rounded-2xl border border-amber-300 bg-amber-50/50 p-4 dark:border-amber-700/50 dark:bg-amber-950/20">
            <div className="text-[14px] font-extrabold">성장 펀드</div>
            <p className="mt-0.5 text-[11px] text-zinc-500">30일간 매일 다이아와 보급상자를 받습니다.</p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
              <div className="rounded-xl bg-black/[0.03] px-3 py-2 dark:bg-white/[0.05]">
                <div className="text-[10px] font-semibold text-zinc-500">즉시</div>
                <div className="mt-0.5 font-bold tabular-nums">
                  {dia(PREMIUM.instant.diamond)} · 📦{PREMIUM.instant.boxes}
                </div>
              </div>
              <div className="rounded-xl bg-black/[0.03] px-3 py-2 dark:bg-white/[0.05]">
                <div className="text-[10px] font-semibold text-zinc-500">매일 ×{PREMIUM.daily.days}</div>
                <div className="mt-0.5 font-bold tabular-nums">
                  {dia(PREMIUM.daily.diamond)} · 📦{PREMIUM.daily.boxes}
                </div>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-[12px] font-bold tabular-nums">{won(PREMIUM.krw)}</span>
              <Soon />
            </div>
            <p className="mt-2 text-[10px] tabular-nums text-zinc-400">
              총 {dia(premiumTotal.diamond)} · 📦{premiumTotal.boxes}
            </p>
          </div>
        ) : null}

        {tab === 'charge' ? (
          <div className="space-y-2">
            {!verified ? (
              <p className="rounded-xl border border-dashed border-zinc-300 px-3 py-2 text-[11px] leading-relaxed text-zinc-500 dark:border-zinc-700">
                최초 결제 시 휴대폰 본인인증이 필요합니다.
              </p>
            ) : null}
            <ul className="space-y-2">
              {DIAMONDS.map((d) => (
                <Item key={d.id} icon="💎" name={dia(d.total)} detail="다이아 충전" price={won(d.krw)} />
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}
