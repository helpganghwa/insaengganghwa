import 'server-only';

import { MELEE_REWARD_TIERS, MELEE_POINT_HALF_LIFE_DAYS } from '@/lib/game/balance';

/**
 * 대난투 포인트 SQL CASE 생성 — MELEE_REWARD_TIERS(단일 진실 원천)에서 파생.
 * 증분 재계산(incremental)·시간별 스냅샷(snapshot)이 같은 조각을 사용해 TS 함수
 * (meleePointsForRank)와 집계 결과가 항상 일치한다. rankCol/nCol은 코드 상수 식별자만
 * 전달(사용자 입력 아님 — 문자열 조립 안전).
 */
export function meleePointsCaseSql(rankCol: string, nCol: string): string {
  const parts: string[] = [];
  for (const t of MELEE_REWARD_TIERS) {
    if (t.maxRank != null) parts.push(`when ${rankCol} <= ${t.maxRank} then ${t.points}`);
    else if (t.pct != null) parts.push(`when ${rankCol} <= ceil(${nCol} * ${t.pct}) then ${t.points}`);
  }
  const last = MELEE_REWARD_TIERS[MELEE_REWARD_TIERS.length - 1]!;
  return `case ${parts.join(' ')} else ${last.points} end`;
}

/**
 * 감쇠 랭킹 포인트 합 집계식 — Σ(구간 포인트 × 0.5^(경과일/반감기))를 반올림한 정수.
 * 경과일 = KST 오늘 − battle_date(발표일 가산 시 0 → 가중치 1.0이라 증분 +p와 정확히 일치).
 * 감쇠 진행분은 매시 스냅샷(snapshot.ts)·recount가 이 식으로 재계산해 자연 반영된다.
 * dateCol은 melee_battles.battle_date 코드 상수 식별자만 전달(문자열 조립 안전).
 */
export function meleeDecayedPointsSumSql(rankCol: string, nCol: string, dateCol: string): string {
  const caseExpr = meleePointsCaseSql(rankCol, nCol);
  const weight = `power(0.5::float8, ((now() at time zone 'Asia/Seoul')::date - ${dateCol})::float8 / ${MELEE_POINT_HALF_LIFE_DAYS})`;
  return `round(coalesce(sum((${caseExpr}) * ${weight}), 0))::int`;
}
