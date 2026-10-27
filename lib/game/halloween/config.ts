/**
 * 할로윈 이벤트(2026) 상수 — 사탕(강화 성공 적립)·강화 대회 기간. 서버·클라 공용(순수 모듈, server-only 없음).
 * 추석(lib/game/chuseok/config.ts)과 같은 뼈대. docs/HALLOWEEN.md.
 *
 * 사탕 규칙(2026-10-20 사용자 확정):
 *  - 기간 중 **모든 아이템**의 강화 성공(mega 포함)마다 **도달 단계 = 사탕**(추석 송편과 같은 적립식). 상한 없음.
 *  - 도달 보상(사다리)은 **누적 총량** 기준 — 교환에 써도 줄지 않는다. 각 단계는 한 번만 받는다.
 *    끝 15만·9단계, 단계 사탕의 10%를 💎·0.3%를 📦로. 6만·15만 단계는 칭호도 준다(2026-10-26: 칭호 3 → 2, 4만·10만은 칭호 없이 💎·📦만).
 *  - 교환은 **사용 가능 사탕**(누적 − 교환에 쓴)을 쓴다. 추석과 같은 비율·한도 없음(2026-10-23 확정).
 *  - 적립은 대회 마감까지, 수령·교환은 결과 마감(11/6 23:59)까지. 그 뒤 남은 사탕은 소멸(화면에 안내).
 *
 * 시작 시각은 서버에서 env `HALLOWEEN_START_ISO`로 앞당길 수 있다(스테이징 검증용 — 프로덕션엔 두지 않는다).
 * 클라 번들에서는 env가 비어 상수로 떨어지지만, 국면 판정은 서버가 넘긴 값(overview.phase)을 쓰므로 무관.
 */
export const HALLOWEEN_START_ISO = process.env.HALLOWEEN_START_ISO || '2026-10-29T00:00:00+09:00';
/** 대회·적립 마감(이 시각 이후의 강화 성공은 사탕이 되지 않는다). */
export const HALLOWEEN_ACCRUE_END_ISO = '2026-11-03T23:59:59.999+09:00';
/** 결과 노출·도달 보상 수령·교환 마감. */
export const HALLOWEEN_CLAIM_END_ISO = '2026-11-06T23:59:59.999+09:00';

export const HALLOWEEN_START_MS = Date.parse(HALLOWEEN_START_ISO);
export const HALLOWEEN_ACCRUE_END_MS = Date.parse(HALLOWEEN_ACCRUE_END_ISO);
export const HALLOWEEN_CLAIM_END_MS = Date.parse(HALLOWEEN_CLAIM_END_ISO);

/** 화면 표기용 날짜(헤더·배너). */
export const HALLOWEEN_START_LABEL = '10/29 00:00';
export const HALLOWEEN_ACCRUE_END_LABEL = '11/3 23:59';
export const HALLOWEEN_CLAIM_END_LABEL = '11/6 23:59';
export const HALLOWEEN_CLAIM_END_DAY = '11/6';

export type HalloweenPhase = 'before' | 'accrue' | 'claim' | 'ended';

/** 시각 → 국면. accrue = 대회 중(적립·수령·교환 모두 가능), claim = 마감 뒤 수령·교환만. */
export function halloweenPhase(at: number | Date = Date.now()): HalloweenPhase {
  const t = typeof at === 'number' ? at : at.getTime();
  if (t < HALLOWEEN_START_MS) return 'before';
  if (t <= HALLOWEEN_ACCRUE_END_MS) return 'accrue';
  if (t <= HALLOWEEN_CLAIM_END_MS) return 'claim';
  return 'ended';
}

/**
 * 사탕 도달 사다리(2026-10-20 확정) — 누적 사탕이 at 이상이면 받을 수 있다. 상자는 3슬롯 균등(전부 3의 배수).
 * 💎 = at의 10%, 📦 = at의 0.3%. 끝까지 💎40,100·📦1,203. title이 있는 단계는 칭호도 함께 준다.
 */
export const CANDY_LADDER: readonly { step: number; at: number; diamond: number; boxes: number; title?: string }[] = [
  { step: 1, at: 1_000, diamond: 100, boxes: 3 },
  { step: 2, at: 3_000, diamond: 300, boxes: 9 },
  { step: 3, at: 7_000, diamond: 700, boxes: 21 },
  { step: 4, at: 15_000, diamond: 1_500, boxes: 45 },
  { step: 5, at: 25_000, diamond: 2_500, boxes: 75 },
  { step: 6, at: 40_000, diamond: 4_000, boxes: 120 },
  { step: 7, at: 60_000, diamond: 6_000, boxes: 180, title: 'halloween26_candy1' },
  { step: 8, at: 100_000, diamond: 10_000, boxes: 300 },
  { step: 9, at: 150_000, diamond: 15_000, boxes: 450, title: 'halloween26_candy3' },
];

/** 사다리 칭호 코드(지급 경로 = 도달 보상 수령). */
export const CANDY_LADDER_TITLES: readonly string[] = CANDY_LADDER.flatMap((l) => (l.title ? [l.title] : []));

/** 교환 상품 — 사용 가능 사탕으로 바꾼다. 추석과 같은 비율·한도 없음(2026-10-23 확정). */
export const CANDY_EXCHANGE = {
  /** 📦 상자 3개(3슬롯 1개씩) = 300사탕 → 상자 1개 = 💎25 등가. */
  box: { candy: 300, boxes: 3 },
  /** 💎 100 = 400사탕. */
  diamond: { candy: 400, diamond: 100 },
} as const;
export type CandyExchangeKind = keyof typeof CANDY_EXCHANGE;

/** 한 번에 교환할 수 있는 최대 횟수(팝업 스텝퍼 상한 — 한도가 아니라 실수 방지). */
export const CANDY_EXCHANGE_MAX_PER_ACTION = 99;

/** 다음 단계까지 남은 사탕(모두 받았으면 null). */
export function nextCandyStep(total: number): { at: number; remain: number } | null {
  const nxt = CANDY_LADDER.find((l) => total < l.at);
  return nxt ? { at: nxt.at, remain: nxt.at - total } : null;
}

// ── 할로윈 강화 대회(순위) ──────────────────────────────────────────────
/**
 * 대회 대상 6종(카탈로그 v7). 순위는 아이템별·서버별로 따로 매긴다.
 * ⚠ 2026-10-25 현재 **임시(더미) 6종** — 세트 확정 뒤 code·이름·그림을 바꾼다(lib/game/equipment/catalog-v7.ts).
 */
export const HALLOWEEN_CONTEST_ITEMS: readonly { code: string }[] = [
  { code: 'halloween_smith_hammer' },
  { code: 'halloween_smith_apron' },
  { code: 'halloween_smith_scarf' },
  { code: 'halloween_ghost_basket' },
  { code: 'halloween_ghost_sheet' },
  { code: 'halloween_ghost_mask' },
];

/** 6종 코드(카탈로그 key = DB code). 보급 풀·활성 카탈로그의 시각 게이트가 쓴다. */
export const HALLOWEEN_ITEM_CODES: readonly string[] = HALLOWEEN_CONTEST_ITEMS.map((i) => i.code);
/** 6종이 열렸는가 — **서버 시각** 기준(추석과 같은 이유: 크론 의존이면 00:02~00:07에 열려 사탕·배너와 어긋난다). */
export function halloweenItemsOpen(now: number | Date = Date.now()): boolean {
  return (typeof now === 'number' ? now : now.getTime()) >= HALLOWEEN_START_MS;
}

/** 아이템당 순위 보상 — 추석과 같은 표(2026-10-20 확정). 상자는 3슬롯 균등(전부 3의 배수). */
export const HALLOWEEN_RANK_REWARDS: readonly { from: number; to: number; diamond: number; boxes: number }[] = [
  { from: 1, to: 1, diamond: 30_000, boxes: 600 },
  { from: 2, to: 2, diamond: 20_000, boxes: 300 },
  { from: 3, to: 3, diamond: 10_000, boxes: 150 },
  { from: 4, to: 5, diamond: 5_000, boxes: 90 },
  { from: 6, to: 10, diamond: 3_000, boxes: 60 },
];
export const HALLOWEEN_RANK_LIMIT = 10;

export function rankRewardFor(rank: number): { diamond: number; boxes: number } | null {
  const t = HALLOWEEN_RANK_REWARDS.find((r) => rank >= r.from && rank <= r.to);
  return t ? { diamond: t.diamond, boxes: t.boxes } : null;
}

/** 다음 보상 구간(더 좋은 구간)의 마지막 등수 — 현황판 "N등까지 +M"용. 1등이면 null. */
export function nextRewardTierEnd(rank: number): number | null {
  if (rank <= 1) return null;
  const cur = HALLOWEEN_RANK_REWARDS.find((r) => rank >= r.from && rank <= r.to);
  if (!cur) return HALLOWEEN_RANK_LIMIT;
  const idx = HALLOWEEN_RANK_REWARDS.indexOf(cur);
  return HALLOWEEN_RANK_REWARDS[idx - 1]?.to ?? null;
}

/** 순위 칭호 코드 — 6종 공통(2026-10-20 확정). rank1 = 1등. */
export const HALLOWEEN_RANK_TITLES: readonly string[] = ['halloween26_rank1', 'halloween26_rank2', 'halloween26_rank3'];

/**
 * 순위 → 칭호. 6종 공통 3개, 도달한 등수 이하 전부(1등이면 셋, 2등이면 둘, 3등이면 하나). 4등 밖은 없음.
 * 여러 아이템에서 입상해도 같은 칭호라 중복 지급은 없다(user_titles PK).
 */
export function contestTitlesFor(rank: number): string[] {
  if (rank < 1 || rank > 3) return [];
  const out: string[] = [];
  for (let t = rank; t <= 3; t++) out.push(`halloween26_rank${t}`);
  return out;
}
