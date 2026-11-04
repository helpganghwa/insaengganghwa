/**
 * 순간 사건 칭호 규칙(소규모 업데이트 17, 2026-11-04) — 순수 함수(서버 훅·소급 스크립트·테스트 공용).
 * 지급은 event-grants.ts. 조건 문구는 defs.server.ts에만 있고 이 파일은 code만 다룬다.
 */

/** 바늘구멍 — 성공률이 이 값(bp) 이하인 강화에서 성공·대성공. 50bp = 0.5%. */
export const NEEDLE_MAX_RATE_BP = 50;
/** 찾을 수 없음 — 강화 단계가 정확히 이 값이 된 순간(올라서든 내려서든). */
export const NOT_FOUND_LEVEL = 404;

const KST_OFFSET_MS = 9 * 3_600_000;
const DAY_MS = 86_400_000;

/** KST 자정 정각 1초 안(00:00:00.000~00:00:00.999)인가. */
export function isKstMidnightSecond(at: Date | number): boolean {
  const ms = typeof at === 'number' ? at : at.getTime();
  return (((ms + KST_OFFSET_MS) % DAY_MS) + DAY_MS) % DAY_MS < 1_000;
}

/** 강화 결과 하나로 얻는 순간 칭호 code 목록. */
export function enhanceMomentTitles(r: {
  outcome: string;
  fromLevel: number;
  toLevel: number;
  effectiveRateBp: number;
  resolvedAt: Date | number;
}): string[] {
  const out: string[] = [];
  if ((r.outcome === 'success' || r.outcome === 'mega') && r.effectiveRateBp <= NEEDLE_MAX_RATE_BP) out.push('enh_needle');
  if (r.toLevel === NOT_FOUND_LEVEL && r.fromLevel !== NOT_FOUND_LEVEL) out.push('enh_404');
  if (isKstMidnightSecond(r.resolvedAt)) out.push('enh_midnight');
  return out;
}

/** 점령전 단신 활약 → 칭호 code. */
export function soloFeatTitle(kind: 'take' | 'hold'): string {
  return kind === 'take' ? 'cq_solo_take' : 'cq_solo_hold';
}
