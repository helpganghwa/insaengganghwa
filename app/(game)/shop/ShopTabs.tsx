'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { assetUrl } from '@/lib/asset-versions';
import { useResourceToast, type HeaderReward } from '@/components/ResourceToast';
import { useDiamond } from '@/components/DiamondContext';
import { PublicFooter } from '@/components/PublicFooter';

import { claimFreeAction, devPurchaseAction, buyBoxAction, verifyPurchaseAction } from './actions';
import { runCheckout } from './checkout';
import type { FreeSlot } from '@/lib/game/shop/free';
import { BOX, CASH, PREMIUM, DIAMONDS, productPeriod } from '@/lib/game/shop/catalog';

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
  daily: { period: '매일', reward: '📦 3개', diamond: 0, boxes: 3 },
  weekly: { period: '매주', reward: '📦 20개', diamond: 0, boxes: 20 },
  monthly: { period: '매월', reward: '📦 100개', diamond: 0, boxes: 100 },
  signup: { period: '', reward: '💎 1,000', diamond: 1000, boxes: 0 },
};

// 카드·기간별 한 줄 설명(플레이버). 기간(일일/주간/월간) × 카드 종류마다 다르게.
type ShopPeriod = 'daily' | 'weekly' | 'monthly';
// 현금 상품 설명 — 상품 id별로 쉬운 말로 모두 다르게.
const CASH_DESC: Record<string, string> = {
  d1: '하루 모험에 딱 맞는 한 줌',
  d2: '오늘 하루 든든하게',
  d3: '오늘 누리는 작은 사치',
  w1: '일주일 여행 밑천',
  w2: '한 주를 버티는 보급',
  w3: '일주일을 넉넉하게',
  m1: '한 달치 두둑한 짐',
  m2: '한 달을 든든하게',
  m3: '한 달 최고의 보상',
};
const BOX_DESC: Record<ShopPeriod, string> = {
  daily: '오늘 쓸 상자 한 줌',
  weekly: '한 주를 채울 상자 꾸러미',
  monthly: '한 달치 상자를 가득 담아',
};
// 견습의 주머니(💎 보급상자) — 기간별 이름·배경(작은/기본/큰). 주간은 기존 box 배경 재사용.
const BOX_NAME: Record<ShopPeriod, string> = {
  daily: '견습의 작은 주머니',
  weekly: '견습의 주머니',
  monthly: '견습의 큰 주머니',
};
const BOX_BG: Record<ShopPeriod, string> = {
  daily: 'box-sm',
  weekly: 'box',
  monthly: 'box-lg',
};
const FREE_DESC: Record<FreeSlot, string> = {
  daily: '매일 문 여는 작은 선물',
  weekly: '한 주를 여는 깜짝 선물',
  monthly: '달마다 찾아오는 선물',
  signup: '처음 온 당신께 드리는 선물',
};
// 다이아 충전(충전 탭) — 상품(받는 다이아의 가치) 중심 설명, 점층 톤(배경의 격이 받쳐줌).
const DIAMOND_DESC: Record<string, string> = {
  starter: '가볍게 시작하는 다이아 한 줌',
  small: '알차게 챙기는 다이아 꾸러미',
  medium: '넉넉하게 채우는 다이아',
  large: '여유롭게 누리는 다이아',
  mega: '왕처럼 마음껏 누리는 다이아',
};
// 현금 상품 id → 배경/캐릭터 에셋 키. 캐릭터는 등급(모험가/기사/왕) 공용, 배경은 기간별로 다름.
// 주간(w*)은 기존 배경 재사용, 일일(*-sm)=단출/월간(*-lg)=풍성.
const CASH_ART: Record<string, { bg: string; char: string }> = {
  d1: { bg: 'adventurer-sm', char: 'adventurer' },
  d2: { bg: 'knight-sm', char: 'knight' },
  d3: { bg: 'vault-sm', char: 'vault' },
  w1: { bg: 'adventurer', char: 'adventurer' },
  w2: { bg: 'knight', char: 'knight' },
  w3: { bg: 'vault', char: 'vault' },
  m1: { bg: 'adventurer-lg', char: 'adventurer' },
  m2: { bg: 'knight-lg', char: 'knight' },
  m3: { bg: 'vault-lg', char: 'vault' },
};

const won = (n: number) => `₩${n.toLocaleString('ko-KR')}`;
const dia = (n: number) => `💎${n.toLocaleString('ko-KR')}`;

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
  tall,
  compact,
  charCenter,
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
  tall?: boolean;
  compact?: boolean;
  charCenter?: boolean;
  onClick: () => void;
}) {
  const titleColor = accent === 'emerald' ? 'text-emerald-300' : 'text-amber-300';
  const border = accent === 'emerald' ? 'border-emerald-900/40' : 'border-amber-900/40';
  const height = compact ? 'h-[62px]' : tall ? 'h-[96px]' : 'h-[76px]';
  const rightValue = price ?? detail; // compact: 우측에 가격(없으면 보상) 한 가지만
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={`relative block ${height} w-full isolate overflow-hidden rounded-xl border ${border} text-left shadow-md shadow-black/30 transition active:scale-[0.99] ${
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
            className={`pointer-events-none absolute top-0 h-[140%] w-auto drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)] ${
              charCenter ? 'left-1/2 -translate-x-1/2' : 'right-1'
            }`}
            style={{ imageRendering: 'pixelated' }}
          />
        ) : null}
        {/* 좌→우 그라데이션(텍스트 가독성) */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/85 via-black/45 to-transparent" />
        {compact ? (
          <>
            {/* 심플 — 제목 + (있으면) 설명 한 줄 */}
            <div className="relative z-10 flex h-full flex-col justify-center px-3.5">
              <div
                className={`text-[14px] font-extrabold ${titleColor} text-pixel-outline drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]`}
              >
                {title}
              </div>
              {desc ? (
                <div className="mt-0.5 truncate text-[10px] font-medium text-white/80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                  {desc}
                </div>
              ) : null}
            </div>
            {/* 우측 값(가격 또는 보상) */}
            {rightValue ? (
              <div className="absolute right-3 top-1/2 z-10 -translate-y-1/2 text-[13px] font-extrabold tabular-nums text-white drop-shadow-[0_1px_3px_rgba(0,0,0,1)]">
                {rightValue}
              </div>
            ) : null}
          </>
        ) : (
          <>
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
          </>
        )}
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
  payEnabled,
  purchased: initialPurchased,
  premiumDays: initialPremiumDays,
  initialTab = 'daily',
  returnPaymentId = null,
  returnCode = null,
}: {
  free: Record<FreeSlot, boolean>;
  isAdmin: boolean;
  /** 포트원 결제 설정 완료 여부 — true면 전 유저 실결제, false면 어드민만 테스트 즉시구매. */
  payEnabled: boolean;
  purchased: string[];
  premiumDays: number | null;
  /** 딥링크용 초기 탭(예: 헤더 다이아 클릭 → ?tab=charge). */
  initialTab?: Tab;
  /** 모바일 결제 복귀 — 포트원이 /shop?paymentId=…(&code=…)로 리다이렉트. 화면 내에서 검증 처리. */
  returnPaymentId?: string | null;
  returnCode?: string | null;
}) {
  const router = useRouter();
  const { showHeaderToast } = useResourceToast();
  const { diamond, optimisticAdjust } = useDiamond();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [paying, setPaying] = useState(false);
  const [free, setFree] = useState(initialFree);
  const [claiming, setClaiming] = useState<FreeSlot | null>(null);
  const [purchased, setPurchased] = useState<Set<string>>(() => new Set(initialPurchased));
  const [premiumDays, setPremiumDays] = useState<number | null>(initialPremiumDays);
  const [confirm, setConfirm] = useState<string | null>(null); // 구매 확인 대기 중인 상품
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, startTransition] = useTransition();
  const returnHandled = useRef(false);

  // 서버 권위 상태 동기화 — router.refresh()로 prop이 갱신되면 로컬 state에 반영(결제 복귀 후 즉시
  //  구매함 비활성). lazy useState는 prop 변경을 안 받으므로 prop 변경 시 명시 동기화.
  useEffect(() => {
    setPurchased(new Set(initialPurchased));
  }, [initialPurchased]);
  useEffect(() => {
    setPremiumDays(initialPremiumDays);
  }, [initialPremiumDays]);

  // 모바일 결제 복귀 — 포트원이 /shop?paymentId=…(&code=…)로 돌아오면 화면 내에서 검증·지급 확인.
  //  별도 페이지 없이 상점에서 처리. 처리 후 쿼리 제거(새로고침 시 재처리 방지). 지급 권위는 서버(웹훅 포함).
  useEffect(() => {
    if (returnHandled.current) return;
    if (!returnPaymentId && !returnCode) return;
    returnHandled.current = true;
    window.history.replaceState(null, '', '/shop'); // 쿼리 정리(결제 파라미터 제거)
    if (returnCode) {
      // 실패/취소 — 취소는 조용히, 그 외만 안내.
      if (returnCode !== 'PAY_CANCEL' && returnCode !== 'PAY_PROCESS_CANCELED') {
        showHeaderToast({ title: '결제가 완료되지 않았습니다' });
      }
      return;
    }
    if (returnPaymentId) {
      void (async () => {
        const v = await verifyPurchaseAction(returnPaymentId);
        if (v.status === 'success') {
          router.refresh(); // 다이아·상자·프리미엄 등 서버 권위 상태 동기화.
          showHeaderToast({ title: '구매 완료' });
        } else {
          showHeaderToast({
            title: v.code === 'AMOUNT_MISMATCH' ? '결제 금액 오류 — 문의 바랍니다' : '결제 확인 실패',
          });
        }
      })();
    }
    // 마운트 1회만 — returnPaymentId/Code는 초기 URL 파생값.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const soon = () => showHeaderToast({ title: '준비 중입니다' });
  const isLimited = (id: string) => productPeriod(id) !== null;
  // 결제 설정이 되어 있으면 전 유저 실결제, 아니면 어드민 테스트 즉시구매만 판매 가능.
  const canSell = payEnabled || isAdmin;
  const buy = (id: string) => (payEnabled ? onPay(id) : onBuy(id));

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
      showHeaderToast({ title: '이미 구매완료한 상품입니다' });
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
      showHeaderToast({ title: '이미 구매완료한 상품입니다' });
      return;
    }
    if (limited && productId !== PREMIUM.id) setPurchased((p) => new Set(p).add(productId)); // 낙관적 흑백
    if (productId === PREMIUM.id) setPremiumDays(PREMIUM.daily.days); // 낙관적 잔여일수
    startTransition(async () => {
      const r = await devPurchaseAction(productId);
      if (r.status === 'success') {
        if (r.diamond) optimisticAdjust(BigInt(r.diamond));
        const rewards: HeaderReward[] = [];
        if (r.diamond) rewards.push({ icon: '💎', amount: r.diamond });
        if (r.boxes) rewards.push({ icon: '', amount: r.boxes });
        showHeaderToast({ title: '테스트 구매', rewards });
      } else if (r.code === 'ALREADY_PURCHASED') {
        setPurchased((p) => new Set(p).add(productId));
        showHeaderToast({ title: '이미 구매완료한 상품입니다' });
      } else {
        if (limited)
          setPurchased((p) => {
            const n = new Set(p);
            n.delete(productId);
            return n;
          }); // 복원
        showHeaderToast({ title: '구매 실패' });
      }
    });
  };

  // 실결제(포트원) — 전 유저. 주문 생성 → 결제창 → 서버 검증·지급. 지급 권위는 서버(웹훅+verify).
  //  모바일은 결제창에서 /shop으로 페이지 복귀(아래 useEffect가 검증) → 이 ok 분기는 PC 팝업 경로.
  const onPay = (productId: string) => {
    if (paying) return;
    const limited = isLimited(productId);
    if (limited && purchased.has(productId)) {
      showHeaderToast({ title: '이미 구매완료한 상품입니다' });
      return;
    }
    setPaying(true);
    void (async () => {
      // 복귀 URL = 상점 자신(별도 페이지 없음). 포트원이 ?paymentId=…(&code=…)를 덧붙여 복귀.
      const r = await runCheckout(productId, `${window.location.origin}/shop`);
      setPaying(false);
      if (r.ok) {
        if (limited && productId !== PREMIUM.id) setPurchased((p) => new Set(p).add(productId));
        if (productId === PREMIUM.id) setPremiumDays(PREMIUM.daily.days);
        router.refresh(); // 다이아·보유 상자 등 서버 권위 상태 재동기화.
        showHeaderToast({ title: '구매 완료' });
      } else if (r.reason === 'cancel') {
        // 사용자 취소 — 조용히 무시.
      } else {
        const title =
          r.code === 'MINOR_LIMIT'
            ? '미성년 월 구매한도를 초과했습니다'
            : r.code === 'ALREADY_PURCHASED'
              ? '이미 구매완료한 상품입니다'
              : r.code === 'AMOUNT_MISMATCH'
                ? '결제 금액 오류 — 고객센터로 문의해 주세요'
                : '결제에 실패했습니다';
        if (r.code === 'ALREADY_PURCHASED') setPurchased((p) => new Set(p).add(productId));
        showHeaderToast({ title });
      }
    })();
  };

  // 💎로 보급상자 구매(견습의 주머니) — 전 유저. 잔액 사전체크 + 낙관 차감, 실패 시 복원.
  const onBuyBox = (productId: string, cost: number) => {
    if (purchased.has(productId)) {
      showHeaderToast({ title: '이미 구매완료한 상품입니다' });
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
        showHeaderToast({ title: '구매 완료', rewards: [{ icon: '', amount: r.boxes }] });
      } else {
        optimisticAdjust(BigInt(cost)); // 💎 복원
        if (r.code === 'ALREADY_PURCHASED') {
          showHeaderToast({ title: '이미 구매완료한 상품입니다' });
        } else {
          setPurchased((p) => {
            const n = new Set(p);
            n.delete(productId);
            return n;
          }); // 복원
          showHeaderToast({
            icon: r.code === 'INSUFFICIENT_DIAMOND' ? '💎' : undefined,
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
        if (d.boxes) rewards.push({ icon: '', amount: d.boxes });
        showHeaderToast({ title: '무료 수령', rewards });
      } else {
        setFree((f) => ({ ...f, [slot]: true }));
        if (d.diamond) optimisticAdjust(BigInt(-d.diamond));
        showHeaderToast({
          title: r.code === 'ALREADY_CLAIMED' ? '이미 수령했습니다' : '수령 실패',
        });
      }
      setClaiming(null);
    });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
        {/* 컨텐츠 영역 — flex-1 유지(짧아도 footer를 하단으로 밀어냄). 컨텐츠와 footer 모두 함께 스크롤. */}
        <div className="flex-1 px-3 py-3">
        {/* 프리미엄 상단 배너 — 약간 큰 배너 카드 */}
        <ul className="mb-3">
          <BannerCard
            bg="premium"
            char="premium"
            tall
            charCenter
            title="성장 프리미엄"
            desc="한 달간 매일 보상이 쏟아지는 패스"
            detail={`즉시 ${dia(PREMIUM.instant.diamond)}·📦${PREMIUM.instant.boxes} · 매일 ${dia(
              PREMIUM.daily.diamond,
            )}·📦${PREMIUM.daily.boxes}`}
            price={premiumDays != null ? `${premiumDays}일 남음` : won(PREMIUM.krw)}
            confirming={confirm === PREMIUM.id}
            onClick={() =>
              premiumDays != null
                ? showHeaderToast({ title: `이용 중 — ${premiumDays}일 남음` })
                : tapPaid(PREMIUM.id, canSell, () => buy(PREMIUM.id))
            }
          />
        </ul>

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
                  showHeaderToast({ title: '이미 수령했습니다' });
                  return;
                }
                claimFreeSlot(tab);
              }}
            />
            {/* 견습의 주머니(💎로 구매) — 기간별 이름·배경, 1탭 확인 2탭 구매 */}
            <BannerCard
              bg={BOX_BG[tab]}
              char="apprentice"
              title={BOX_NAME[tab]}
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
              const art = CASH_ART[c.id] ?? { bg: 'adventurer', char: 'adventurer' };
              return (
                <BannerCard
                  key={c.id}
                  bg={art.bg}
                  char={art.char}
                  title={c.name}
                  desc={CASH_DESC[c.id] ?? ''}
                  detail={`${dia(c.diamond)} · 📦${c.boxes}`}
                  price={won(c.krw)}
                  grayscale={purchased.has(c.id)}
                  confirming={confirm === c.id}
                  onClick={() => tapPaid(c.id, canSell, () => buy(c.id))}
                />
              );
            })}
          </ul>
        ) : (
          <ul className="space-y-2">
            {/* 가입 환영 무료 — 심플(62px). 좌: 보상 / 우: '무료' */}
            <BannerCard
              bg="dia-free"
              accent="emerald"
              compact
              title={FREE_DISPLAY.signup.reward}
              desc={FREE_DESC.signup}
              detail=""
              price="무료"
              grayscale={!free.signup}
              onClick={() => {
                if (claiming) return;
                if (!free.signup) {
                  showHeaderToast({ title: '이미 수령했습니다' });
                  return;
                }
                claimFreeSlot('signup');
              }}
            />
            {/* 다이아 충전 5종 — 심플(62px), 반복 구매(흑백 없음), 1탭 확인 2탭 구매 */}
            {DIAMONDS.map((d) => (
              <BannerCard
                key={d.id}
                bg={`dia-${d.id}`}
                compact
                title={dia(d.total)}
                desc={DIAMOND_DESC[d.id] ?? ''}
                detail=""
                price={won(d.krw)}
                confirming={confirm === d.id}
                onClick={() => tapPaid(d.id, canSell, () => buy(d.id))}
              />
            ))}
          </ul>
        )}
        </div>

        {/* 전자상거래법 표시 — 컨텐츠 패딩 영역 밖 전체폭, 컨텐츠와 함께 스크롤(사업자정보·약관·환불). */}
        <PublicFooter />
      </div>
    </div>
  );
}
