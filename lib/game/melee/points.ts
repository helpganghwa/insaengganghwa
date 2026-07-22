import 'server-only';

import { MELEE_REWARD_TIERS } from '@/lib/game/balance';

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
