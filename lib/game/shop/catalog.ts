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

export const PREMIUM = {
  id: 'premium',
  krw: 29900,
  instant: { diamond: 4000, boxes: 30 },
  daily: { diamond: 300, boxes: 3, days: 30 },
};
export const PREMIUM_TOTAL = {
  diamond: PREMIUM.instant.diamond + PREMIUM.daily.diamond * PREMIUM.daily.days,
  boxes: PREMIUM.instant.boxes + PREMIUM.daily.boxes * PREMIUM.daily.days,
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
 * 프리미엄은 drip 미구현이라 전체 합계를 즉시 지급. 보급상자(💎 구매)는 대상 아님(null).
 */
export function shopGrant(productId: string): { diamond: number; boxes: number } | null {
  if (productId === PREMIUM.id) return { ...PREMIUM_TOTAL };
  const d = DIAMONDS.find((x) => x.id === productId);
  if (d) return { diamond: d.total, boxes: 0 };
  for (const p of ['daily', 'weekly', 'monthly'] as Period[]) {
    const c = CASH[p].find((x) => x.id === productId);
    if (c) return { diamond: c.diamond, boxes: c.boxes };
  }
  return null;
}
