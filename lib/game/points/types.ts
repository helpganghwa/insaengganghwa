/** 포인트 상점 — 클라·서버 공용 순수 타입·문구(docs/POINT-SHOP.md). */
export type PointKind = 'melee' | 'mileage';

export type PointEntry = { id: string; date: string; note: string; delta: number };

export type PointsOverview = {
  melee: { balance: number; recent: PointEntry[] };
  mileage: { balance: number; recent: PointEntry[] };
};

/** 잔액 카드 안내 문구(2026-09-08 사용자 확정). 마일리지 비율은 balance.ts MILEAGE_KRW_PER_POINT(100원=1점)와 1:1. */
export const POINTS_COPY = {
  melee: '매회 대난투 결과 순위에 따라 쌓입니다.',
  mileage: '결제 금액의 1%가 쌓입니다.',
} as const;

export const EMPTY_POINTS: PointsOverview = { melee: { balance: 0, recent: [] }, mileage: { balance: 0, recent: [] } };
