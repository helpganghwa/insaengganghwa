/**
 * 상점 상품 카탈로그 — 클라(표시)·서버(테스트 지급) 공용 단일 진실 원천.
 * 수치는 시작값(경제 시뮬 후 조정). 결제 백엔드 연동 전 — 어드민 테스트 즉시 구매에 사용.
 */
export type Period = 'daily' | 'weekly' | 'monthly';

/** 💎로 사는 보급상자(견습의 주머니) — 인게임 재화 sink. (현금 아님 → 테스트 즉시구매 대상 아님) */
export const BOX: Record<Period, { cost: number; boxes: number }> = {
  daily: { cost: 200, boxes: 8 },
  weekly: { cost: 1200, boxes: 60 },
  monthly: { cost: 4000, boxes: 240 },
};

export type Cash = { id: string; name: string; krw: number; diamond: number; boxes: number };
export const CASH: Record<Period, Cash[]> = {
  daily: [
    { id: 'd1', name: '모험가의 작은 자루', krw: 1200, diamond: 290, boxes: 3 },
    { id: 'd2', name: '기사의 작은 상자', krw: 2500, diamond: 610, boxes: 7 },
    { id: 'd3', name: '왕의 작은 금고', krw: 4900, diamond: 1200, boxes: 15 },
  ],
  weekly: [
    { id: 'w1', name: '모험가의 자루', krw: 4900, diamond: 1360, boxes: 18 },
    { id: 'w2', name: '기사의 상자', krw: 9900, diamond: 2750, boxes: 40 },
    { id: 'w3', name: '왕의 금고', krw: 19900, diamond: 5550, boxes: 90 },
  ],
  monthly: [
    { id: 'm1', name: '모험가의 큰 자루', krw: 9900, diamond: 3200, boxes: 55 },
    { id: 'm2', name: '기사의 큰 상자', krw: 19900, diamond: 6450, boxes: 120 },
    { id: 'm3', name: '왕의 큰 금고', krw: 39900, diamond: 12900, boxes: 260 },
  ],
};

export const PREMIUM = {
  id: 'premium',
  krw: 14900,
  // 즉시 지급(구매 시 1회) + 일일 지급(30일). 둘 다 우편으로 전달(즉시=구매 tx, 일일=로그인 드립).
  // 상자는 무기/방어구/장신구 균등 분배(30→10/10/10, 15→5/5/5).
  instant: { diamond: 1000, boxes: 30 },
  daily: { diamond: 300, boxes: 15, days: 30 },
};

/**
 * 인생 특가 — 서버별 1회 한정(사용자 확정: 서버별 지갑 경제의 경쟁 출발선). 목적은 수익이
 * 아니라 결제 전환(가치 ~22배, 1회라 경제 무부담). 지급은 구매 시점 활성 서버 지갑.
 * 상자는 부위 균등(30 → 10/10/10). id는 하위호환 유지(first_special).
 */
export const FIRST_SPECIAL = {
  id: 'first_special',
  krw: 1000,
  grant: { diamond: 5000, boxes: 30 },
};

export const DIAMONDS = [
  { id: 'starter', total: 300, krw: 1500 },
  { id: 'small', total: 1200, krw: 6000 },
  { id: 'medium', total: 2800, krw: 13000 },
  { id: 'large', total: 6400, krw: 28000 },
  { id: 'mega', total: 16000, krw: 68000 },
];

/**
 * 현금 상품(현금 패키지 + 프리미엄 + 다이아 충전) id → 지급량. 어드민 테스트 즉시구매용.
 * 프리미엄은 '즉시 지급분'만 반환(일일분은 로그인 드립으로 별도 우편). 보급상자(💎 구매)는 대상 아님(null).
 */
export function shopGrant(productId: string): { diamond: number; boxes: number } | null {
  if (productId === PREMIUM.id) return { ...PREMIUM.instant };
  if (productId === FIRST_SPECIAL.id) return { ...FIRST_SPECIAL.grant };
  const d = DIAMONDS.find((x) => x.id === productId);
  if (d) return { diamond: d.total, boxes: 0 };
  for (const p of ['daily', 'weekly', 'monthly'] as Period[]) {
    const c = CASH[p].find((x) => x.id === productId);
    if (c) return { diamond: c.diamond, boxes: c.boxes };
  }
  return null;
}

/**
 * 현금 결제 상품(현금 패키지 + 프리미엄 + 다이아 충전)의 결제 메타 — 가격(₩)·표시명.
 * 결제 금액은 **서버 권위**(클라가 보낸 금액 무시) — 주문 생성·검증 모두 이 값으로만. null=결제 불가 상품(보급상자 등).
 */
const DIAMOND_NAME: Record<string, string> = {
  starter: '입문 다이아 꾸러미',
  small: '다이아 꾸러미',
  medium: '다이아 상자',
  large: '다이아 금고',
  mega: '다이아 보물',
};
export function paidProduct(productId: string): { krw: number; orderName: string } | null {
  if (productId === PREMIUM.id) return { krw: PREMIUM.krw, orderName: '성장 프리미엄' };
  if (productId === FIRST_SPECIAL.id) return { krw: FIRST_SPECIAL.krw, orderName: '인생 특가 패키지' };
  const d = DIAMONDS.find((x) => x.id === productId);
  if (d)
    return {
      krw: d.krw,
      orderName: `${DIAMOND_NAME[d.id] ?? '다이아 충전'} ${d.total.toLocaleString('ko-KR')}💎`,
    };
  for (const p of ['daily', 'weekly', 'monthly'] as Period[]) {
    const c = CASH[p].find((x) => x.id === productId);
    if (c) return { krw: c.krw, orderName: c.name };
  }
  return null;
}

/** 💎로 구매하는 보급상자(견습의 주머니) — id box_daily/weekly/monthly → 💎 비용 + 박스 수. */
const BOX_ID: Record<string, Period> = {
  box_daily: 'daily',
  box_weekly: 'weekly',
  box_monthly: 'monthly',
};
export function boxGrant(productId: string): { cost: number; boxes: number } | null {
  const p = BOX_ID[productId];
  if (!p) return null;
  return { cost: BOX[p].cost, boxes: BOX[p].boxes };
}

/**
 * 상품의 구매 제한 주기 — 일일/주간/월간 상품은 그 기간 1회만. null = 무제한(다이아 충전).
 * 프리미엄 = 월간. 보급상자(💎)도 탭 기간 따라 제한.
 */
export function productPeriod(productId: string): Period | null {
  if (productId === PREMIUM.id) return 'monthly';
  if (DIAMONDS.some((d) => d.id === productId)) return null;
  if (productId === 'box_daily' || CASH.daily.some((c) => c.id === productId)) return 'daily';
  if (productId === 'box_weekly' || CASH.weekly.some((c) => c.id === productId)) return 'weekly';
  if (productId === 'box_monthly' || CASH.monthly.some((c) => c.id === productId)) return 'monthly';
  return null;
}
