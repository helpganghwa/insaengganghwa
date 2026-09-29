/**
 * 무한의 탑 랭킹 값 — 공용 랭킹 표(leaderboard_ranks, 값 하나 내림차순)에 탑 규칙
 * "높은 층 먼저, 같은 층이면 먼저 도달한 사람 먼저"를 그대로 싣기 위한 합성값.
 *   value = 층 × 10^10 + (10^10 − 1 − 도달 시각의 epoch 초)
 * 층이 같으면 일찍 도달할수록 뒤 항이 커져 앞선다. epoch 초(≈1.8×10^9)는 10^10보다 작고,
 * 1,000층이어도 10^13 수준이라 JS number(2^53)로 안전하다. 화면에는 층만 보인다.
 * 순수 모듈 — 클라이언트(랭킹 화면 표시)에서도 쓴다.
 */
export const TOWER_RANK_SCALE = 10_000_000_000;

export function towerRankValue(floor: number, bestAt: Date | string): number {
  const s = Math.floor(new Date(bestAt).getTime() / 1000);
  return floor * TOWER_RANK_SCALE + (TOWER_RANK_SCALE - 1 - s);
}

export function towerFloorFromRankValue(value: number): number {
  return Math.floor(value / TOWER_RANK_SCALE);
}

/** 같은 식의 SQL 조각(스냅샷·증분 공용) — tower_progress 별칭을 받는다. 초 단위 내림은 JS towerRankValue와 같다. */
export function towerRankValueSql(alias: string): string {
  return `(${alias}.best_floor::bigint * ${TOWER_RANK_SCALE} + (${TOWER_RANK_SCALE - 1} - floor(extract(epoch from ${alias}.best_at))::bigint))`;
}
