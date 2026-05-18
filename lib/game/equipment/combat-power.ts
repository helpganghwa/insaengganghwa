/**
 * 전투력 계산 — BALANCE §3. 순수 함수(읽기 전용 행 → 수치).
 * 개별 = P(강화) × (1 + 초월%) / 총 = (착용 3합) × (1 + 도감강화합 × 0.005).
 * 등급 항 없음(GDD §3.1).
 */
import { pieceCombatPower, totalCombatPower } from '@/lib/game/balance';

export type EquippedRow = { enhanceLevel: number; transcendLevel: number };

export function combatPowerFromRows(
  equipped: readonly EquippedRow[],
  codexEnhanceSum: number,
): number {
  const pieceCPs = equipped.map((e) => pieceCombatPower(e.enhanceLevel, e.transcendLevel));
  return totalCombatPower(pieceCPs, codexEnhanceSum);
}
