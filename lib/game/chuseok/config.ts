/**
 * 한가위 이벤트(2026) 상수 — 송편(강화 성공 적립)·대회 기간. 서버·클라 공용(순수 모듈, server-only 없음).
 *
 * 송편 규칙(2026-09-22 사용자 확정):
 *  - 기간 중 **모든 아이템**의 강화 성공(mega 포함)마다 **도달 단계 = 송편**(세금식). 상한 없음.
 *  - 도달 보상(사다리)은 **누적 총량** 기준 — 교환에 써도 줄지 않는다. 각 단계는 한 번만 받는다.
 *  - 교환은 **사용 가능 송편**(누적 − 교환에 쓴)을 쓴다. 1인 한도 없음.
 *  - 적립은 대회 마감까지, 수령·교환은 결과 마감(10/3 23:59)까지. 그 뒤 남은 송편은 소멸(화면에 안내).
 *
 * ⚠ 출시일은 미확정(9/24 vs 9/25) — START_ISO만 바꾸면 된다. 마감 두 개는 확정(9/30 · 10/3).
 *
 * 시작 시각은 서버에서 env `CHUSEOK_START_ISO`로 앞당길 수 있다(스테이징 검증용 — 프로덕션엔 두지 않는다).
 * 클라 번들에서는 env가 비어 상수로 떨어지지만, 국면 판정은 서버가 넘긴 값(overview.phase)을 쓰므로 무관.
 */
export const CHUSEOK_START_ISO = process.env.CHUSEOK_START_ISO || '2026-09-24T00:00:00+09:00';
/** 대회·적립 마감(이 시각 이후의 강화 성공은 송편이 되지 않는다). */
export const CHUSEOK_ACCRUE_END_ISO = '2026-09-30T23:59:59.999+09:00';
/** 결과 노출·도달 보상 수령·교환 마감. */
export const CHUSEOK_CLAIM_END_ISO = '2026-10-03T23:59:59.999+09:00';

export const CHUSEOK_START_MS = Date.parse(CHUSEOK_START_ISO);
export const CHUSEOK_ACCRUE_END_MS = Date.parse(CHUSEOK_ACCRUE_END_ISO);
export const CHUSEOK_CLAIM_END_MS = Date.parse(CHUSEOK_CLAIM_END_ISO);

export type ChuseokPhase = 'before' | 'accrue' | 'claim' | 'ended';

/** 시각 → 국면. accrue = 대회 중(적립·수령·교환 모두 가능), claim = 마감 뒤 수령·교환만. */
export function chuseokPhase(at: number | Date = Date.now()): ChuseokPhase {
  const t = typeof at === 'number' ? at : at.getTime();
  if (t < CHUSEOK_START_MS) return 'before';
  if (t <= CHUSEOK_ACCRUE_END_MS) return 'accrue';
  if (t <= CHUSEOK_CLAIM_END_MS) return 'claim';
  return 'ended';
}

/** 송편 도달 사다리 — 누적 송편이 at 이상이면 받을 수 있다(상자는 3슬롯 균등, 전부 3의 배수). */
export const SONGPYEON_LADDER: readonly { step: number; at: number; diamond: number; boxes: number }[] = [
  { step: 1, at: 500, diamond: 250, boxes: 15 },
  { step: 2, at: 1_000, diamond: 500, boxes: 30 },
  { step: 3, at: 3_000, diamond: 1_000, boxes: 60 },
  { step: 4, at: 10_000, diamond: 2_000, boxes: 90 },
  { step: 5, at: 20_000, diamond: 4_000, boxes: 150 },
  { step: 6, at: 30_000, diamond: 8_000, boxes: 300 },
];

/** 교환 상품 — 사용 가능 송편으로 바꾼다. 한도 없음(사용자 확정). */
export const SONGPYEON_EXCHANGE = {
  /** 📦 상자 3개(3슬롯 1개씩) = 300송편 → 상자 1개 = 💎25 등가. */
  box: { songpyeon: 300, boxes: 3 },
  /** 💎 100 = 400송편. */
  diamond: { songpyeon: 400, diamond: 100 },
} as const;
export type SongpyeonExchangeKind = keyof typeof SONGPYEON_EXCHANGE;

/** 한 번에 교환할 수 있는 최대 횟수(팝업 스텝퍼 상한 — 한도가 아니라 실수 방지). */
export const SONGPYEON_EXCHANGE_MAX_PER_ACTION = 99;

/** 다음 단계까지 남은 송편(모두 받았으면 null). */
export function nextLadderStep(total: number): { at: number; remain: number } | null {
  const nxt = SONGPYEON_LADDER.find((l) => total < l.at);
  return nxt ? { at: nxt.at, remain: nxt.at - total } : null;
}
