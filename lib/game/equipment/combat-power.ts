/**
 * 전투력 계산 — BALANCE §3. 순수 함수(읽기 전용 행 → 수치).
 * 개별 = P(강화) × (1 + 초월%). 등급 항 없음(GDD §3.1).
 * 총 전투력 = 보유한 모든 카탈로그 아이템(중복 제외)의 개별 전투력 합 — 착용 무관·상태 기반.
 */
import { pieceCombatPower } from '@/lib/game/balance';

export type OwnedRow = {
  catalogItemId: number;
  enhanceLevel: number;
  transcendLevel: number;
};

/**
 * 총 전투력 — 보유 인스턴스를 카탈로그별로 묶어 개별 전투력 최댓값 1개씩만 합산(중복 제외).
 * 같은 카탈로그라도 강화·초월 조합이 달라 최강은 개별 전투력으로 판정(레벨만으론 불충분).
 */
export function combatPowerFromOwned(owned: readonly OwnedRow[]): number {
  const bestByCatalog = new Map<number, number>();
  for (const r of owned) {
    const cp = pieceCombatPower(r.enhanceLevel, r.transcendLevel);
    const prev = bestByCatalog.get(r.catalogItemId);
    if (prev === undefined || cp > prev) bestByCatalog.set(r.catalogItemId, cp);
  }
  let total = 0;
  for (const cp of bestByCatalog.values()) total += cp;
  return total;
}
