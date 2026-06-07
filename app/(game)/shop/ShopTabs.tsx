'use client';

import { useRef, useState, useTransition } from 'react';

import { assetUrl } from '@/lib/asset-versions';
import { useResourceToast, type HeaderReward } from '@/components/ResourceToast';
import { useDiamond } from '@/components/DiamondContext';

import { claimFreeAction, devPurchaseAction, buyBoxAction } from './actions';
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

// 카드·기간별 한 줄 설명(플레이버). 기간(일일/주간/월간) × 카드 종류마다 다르게.
type ShopPeriod = 'daily' | 'weekly' | 'monthly';
const CASH_DESC: Record<ShopPeriod, Record<string, string>> = {
  daily: {
    '모험가의 자루': '하루치 여비를 챙겨서',
    '기사의 상자': '오늘 하루를 든든히 무장',
    '왕의 금고': '하루를 황금빛으로 물들여',
  },
  weekly: {
    '모험가의 자루': '한 주를 함께할 넉넉한 보따리',
    '기사의 상자': '일주일을 버티는 든든한 군량',
    '왕의 금고': '이번 주, 왕처럼 누리기',
  },
  monthly: {
    '모험가의 자루': '한 달 여정을 위한 짐 꾸러미',
    '기사의 상자': '한 달간 흔들림 없는 보급',
    '왕의 금고': '한 달을 지배하는 최고의 보상',
  },
};
const BOX_DESC: Record<ShopPeriod, string> = {
  daily: '오늘 쓸 상자 한 줌',
  weekly: '한 주를 채울 상자 꾸러미',
  monthly: '한 달치 상자를 가득 담아',
};
const FREE_DESC: Record<FreeSlot, string> = {
  daily: '매일 문 여는 작은 선물',
  weekly: '한 주를 여는 깜짝 선물',
  monthly: '달마다 찾아오는 선물',
  signup: '처음 온 당신께 드리는 선물',
};
// 현금 카드 종류 → 배경/캐릭터 에셋 키.
const CASH_ART: Record<string, { bg: string; char: string }> = {
  '왕의 금고': { bg: 'vault', char: 'vault' },
  '기사의 상자': { bg: 'knight', char: 'knight' },
  '모험가의 자루': { bg: 'adventurer', char: 'adventurer' },
};

const won = (n: number) => `₩${n.toLocaleString('ko-KR')}`;
const dia = (n: number) => `💎${n.toLocaleString('ko-KR')}`;

/** 수령/구매 완료 표시 — 텍스트 대신 초록 체크. */
function CheckBadge() {
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/90">
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="white" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-label="완료">
        <path d="M5 13l4 4L19 7" />
      </svg>
    </span>
  );
}

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
      <li className="flex w-full items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50/70 px-3.5 py-2.5 opacity-60 dark:border-zinc-800 dark:bg-zinc-900/30">
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-bold">{name}</div>
          <div className="mt-0.5 text-[11px] tabular-nums text-zinc-500">{detail}</div>
        </div>
        <CheckBadge />
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
        {busy ? (
          <span className="shrink-0 text-[12px] font-bold text-zinc-400">수령 중…</span>
        ) : available ? (
          <span className="shrink-0 text-[12px] font-bold text-emerald-600 dark:text-emerald-400">
            받기
          </span>
        ) : (
          <CheckBadge />
        )}
      </button>
    </li>
  );
}

/**
 * 상점 배너 카드 — DailySupply식 CSS 레이어(배경 씬 / 테마 캐릭터(선택) / 좌측 그라데이션 / 텍스트).
 * 정보 배치: 제목 → 설명(카드·기간별) → 보상·가격(가격은 약하게). 우측 CTA는 무료 수령용(선택).
 * 완료(구매/수령) 시 흑백(grayscale)만 — 클릭은 유지(상위에서 안내 토스트).
 */
function BannerCard({
  bg,
  char,
  accent = 'amber',
  title,
  desc,
  detail,
  price,
  grayscale,
  confirming,
  onClick,
}: {
  bg: string;
  char?: string;
  accent?: 'amber' | 'emerald';
  title: string;
  desc: string;
  detail: string;
  price?: string;
  grayscale?: boolean;
  confirming?: boolean;
  onClick: () => void;
}) {
  const titleColor = accent === 'emerald' ? 'text-emerald-300' : 'text-amber-300';
  const border = accent === 'emerald' ? 'border-emerald-900/40' : 'border-amber-900/40';
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={`relative block h-[76px] w-full overflow-hidden rounded-xl border ${border} text-left shadow-md shadow-black/30 transition active:scale-[0.99] ${
          grayscale ? 'grayscale' : ''
        }`}
      >
        {/* 배경 씬 */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={assetUrl(`/sprites/shop/${bg}-bg.png`)}
          alt=""
          aria-hidden
          draggable={false}
          className="absolute inset-0 h-full w-full object-cover"
          style={{ imageRendering: 'pixelated' }}
        />
        {/* 테마 캐릭터 — 우측 상단 정렬, 다리쪽이 아래로 넘침 */}
        {char ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={assetUrl(`/sprites/shop/${char}-char.png`)}
            alt=""
            aria-hidden
            draggable={false}
            className="pointer-events-none absolute left-1/2 top-0 h-[140%] w-auto -translate-x-1/2 drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]"
            style={{ imageRendering: 'pixelated' }}
          />
        ) : null}
        {/* 좌→우 그라데이션(텍스트 가독성) */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/85 via-black/45 to-transparent" />
        {/* 정보 — 제목 → 설명 → 보상 (가격은 우측 중앙 별도 배치) */}
        <div className="relative z-10 flex h-full flex-col justify-center px-3.5">
          <div
            className={`text-[14px] font-extrabold ${titleColor} text-pixel-outline drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]`}
          >
            {title}
          </div>
          <div className="mt-0.5 truncate text-[10px] font-medium text-white/85 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
            {desc}
          </div>
          <div className="mt-1 text-[11px] font-semibold tabular-nums text-white/80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
            {detail}
          </div>
        </div>
        {/* 가격 — 배너 우측 중앙 */}
        {price ? (
          <div className="absolute right-3 top-1/2 z-10 -translate-y-1/2 text-[14px] font-extrabold tabular-nums text-white drop-shadow-[0_1px_3px_rgba(0,0,0,1)]">
            {price}
          </div>
        ) : null}
        {/* 구매 확인 오버레이(3초) — 다시 탭하면 구매 확정 */}
        {confirming ? (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-0.5 bg-black/80 px-3 text-center backdrop-blur-[1px]">
            <div className="text-[13px] font-extrabold tabular-nums text-amber-300">{price}</div>
            <div className="text-[12px] font-bold text-white">정말 구매하시겠습니까?</div>
            <div className="text-[10px] text-white/70">구매하려면 다시 탭하세요</div>
          </div>
        ) : null}
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
  const { diamond, optimisticAdjust } = useDiamond();
  const [tab, setTab] = useState<Tab>('daily');
  const [free, setFree] = useState(initialFree);
  const [claiming, setClaiming] = useState<FreeSlot | null>(null);
  const [purchased, setPurchased] = useState<Set<string>>(() => new Set(initialPurchased));
  const [confirm, setConfirm] = useState<string | null>(null); // 구매 확인 대기 중인 상품
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, startTransition] = useTransition();

  const soon = () => showHeaderToast({ icon: '🛒', title: '준비 중입니다' });
  const isLimited = (id: string) => productPeriod(id) !== null;

  // 구매 확인 무장(3초) — 같은 상품을 그 안에 다시 탭하면 확정.
  const armConfirm = (id: string) => {
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    setConfirm(id);
    confirmTimer.current = setTimeout(() => setConfirm(null), 3000);
  };
  const clearConfirm = () => {
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    confirmTimer.current = null;
    setConfirm(null);
  };
  // 유료 카드 탭: 구매완료→토스트 / 미구매→1탭 오버레이, 2탭 확정.
  const tapPaid = (id: string, sellable: boolean, exec: () => void) => {
    if (purchased.has(id)) {
      clearConfirm();
      showHeaderToast({ icon: '🛒', title: '이미 구매완료한 상품입니다' });
      return;
    }
    if (!sellable) {
      soon();
      return;
    }
    if (confirm === id) {
      clearConfirm();
      exec();
    } else {
      armConfirm(id);
    }
  };

  // 어드민: 결제 단계 없이 테스트 즉시 구매(바로 지급). 일반 유저: '준비 중' 토스트.
  const onBuy = (productId: string) => {
    if (!isAdmin) {
      soon();
      return;
    }
    const limited = isLimited(productId);
    if (limited && purchased.has(productId)) {
      showHeaderToast({ icon: '🛒', title: '이미 구매완료한 상품입니다' });
      return;
    }
    if (limited) setPurchased((p) => new Set(p).add(productId)); // 낙관적 흑백
    startTransition(async () => {
      const r = await devPurchaseAction(productId);
      if (r.status === 'success') {
        if (r.diamond) optimisticAdjust(BigInt(r.diamond));
        const rewards: HeaderReward[] = [];
        if (r.diamond) rewards.push({ icon: '💎', amount: r.diamond });
        if (r.boxes) rewards.push({ icon: '📦', amount: r.boxes });
        showHeaderToast({ icon: '🧪', title: '테스트 구매', rewards });
      } else if (r.code === 'ALREADY_PURCHASED') {
        setPurchased((p) => new Set(p).add(productId));
        showHeaderToast({ icon: '🛒', title: '이미 구매완료한 상품입니다' });
      } else {
        if (limited)
          setPurchased((p) => {
            const n = new Set(p);
            n.delete(productId);
            return n;
          }); // 복원
        showHeaderToast({ icon: '⚠️', title: '구매 실패' });
      }
    });
  };

  // 💎로 보급상자 구매(견습의 주머니) — 전 유저. 잔액 사전체크 + 낙관 차감, 실패 시 복원.
  const onBuyBox = (productId: string, cost: number) => {
    if (purchased.has(productId)) {
      showHeaderToast({ icon: '🛒', title: '이미 구매완료한 상품입니다' });
      return;
    }
    if (diamond < BigInt(cost)) {
      showHeaderToast({ icon: '💎', title: '다이아가 부족합니다' });
      return;
    }
    optimisticAdjust(-BigInt(cost));
    setPurchased((p) => new Set(p).add(productId)); // 낙관적 흑백
    startTransition(async () => {
      const r = await buyBoxAction(productId);
      if (r.status === 'success') {
        showHeaderToast({ icon: '📦', title: '구매 완료', rewards: [{ icon: '📦', amount: r.boxes }] });
      } else {
        optimisticAdjust(BigInt(cost)); // 💎 복원
        if (r.code === 'ALREADY_PURCHASED') {
          showHeaderToast({ icon: '🛒', title: '이미 구매완료한 상품입니다' });
        } else {
          setPurchased((p) => {
            const n = new Set(p);
            n.delete(productId);
            return n;
          }); // 복원
          showHeaderToast({
            icon: r.code === 'INSUFFICIENT_DIAMOND' ? '💎' : '⚠️',
            title: r.code === 'INSUFFICIENT_DIAMOND' ? '다이아가 부족합니다' : '구매 실패',
          });
        }
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
            {/* 무료 수령 — 받기/수령완료 표기 없음. 클릭 시 낙관적 수령(완료=흑백). */}
            <BannerCard
              bg="free"
              char="gift"
              accent="emerald"
              title="무료"
              desc={FREE_DESC[tab]}
              detail={FREE_DISPLAY[tab].reward}
              grayscale={!free[tab]}
              onClick={() => {
                if (claiming) return;
                if (!free[tab]) {
                  showHeaderToast({ icon: '🎁', title: '이미 수령했습니다' });
                  return;
                }
                claimFreeSlot(tab);
              }}
            />
            {/* 견습의 주머니(💎로 구매) — 1탭 확인, 2탭 구매 */}
            <BannerCard
              bg="box"
              char="apprentice"
              title="견습의 주머니"
              desc={BOX_DESC[tab]}
              detail={`📦 ${BOX[tab].boxes}개`}
              price={dia(BOX[tab].cost)}
              grayscale={purchased.has(`box_${tab}`)}
              confirming={confirm === `box_${tab}`}
              onClick={() =>
                tapPaid(`box_${tab}`, true, () => onBuyBox(`box_${tab}`, BOX[tab].cost))
              }
            />
            {/* 현금 패키지 3종 — 1탭 확인, 2탭 구매(어드민만 즉시구매) */}
            {CASH[tab].map((c) => {
              const art = CASH_ART[c.name] ?? { bg: 'adventurer' };
              return (
                <BannerCard
                  key={c.id}
                  bg={art.bg}
                  char={art.char}
                  title={c.name}
                  desc={CASH_DESC[tab][c.name] ?? ''}
                  detail={`${dia(c.diamond)} · 📦${c.boxes}`}
                  price={won(c.krw)}
                  grayscale={purchased.has(c.id)}
                  confirming={confirm === c.id}
                  onClick={() => tapPaid(c.id, isAdmin, () => onBuy(c.id))}
                />
              );
            })}
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
