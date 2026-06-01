/**
 * 레이드 파생 계산 — BALANCE §5. 순수 함수.
 *
 * 페이즈 돌파 수: 누적 데미지 ≥ Σ_{k=1}^{N} phase1·1.5^(k-1) 인 최대 N.
 * 페이즈 드롭: **(raidId, phase) 결정론** 추첨 → 모든 참여자 동일 적용(GDD §3.5).
 * 돌파 페이즈마다 보급 상자 RAID_PHASE_DROP_BOXES개(슬롯 균등) — 다이아 드롭 없음.
 */
import {
  RAID_PHASE_DROP_BOXES,
  RAID_PHASE_HP_MULT,
  SUPPLY_SLOTS,
  type SupplySlot,
} from '@/lib/game/balance';

/** 누적 데미지로 돌파한 페이즈 수. */
export function raidPhasesCleared(phase1Hp: number, totalDamage: number): number {
  if (totalDamage <= 0 || phase1Hp <= 0) return 0;
  // Σ_{k=1}^{N} phase1·r^(k-1) = phase1·(r^N − 1)/(r − 1) ≤ D
  // → r^N ≤ 1 + D·(r−1)/phase1
  const r = RAID_PHASE_HP_MULT;
  const bound = 1 + (totalDamage * (r - 1)) / phase1Hp;
  const n = Math.floor(Math.log(bound) / Math.log(r));
  return Math.max(0, n);
}

/** FNV-1a 32bit — 결정론 해시(시드 컬럼 불필요, 전원 동일 보장). */
function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** 페이즈 1개 돌파 보상 — 보급 상자 슬롯 목록(RAID_PHASE_DROP_BOXES개). 결정론. */
export function phaseDropOutcome(raidId: bigint, phase: number): SupplySlot[] {
  const slots: SupplySlot[] = [];
  for (let i = 0; i < RAID_PHASE_DROP_BOXES; i++) {
    // 박스별 다른 해시 비트 → 같은 페이즈 내 복수 박스도 결정론 분산.
    const h = fnv1a(`${raidId.toString()}:${phase}:${i}`);
    slots.push(SUPPLY_SLOTS[h % SUPPLY_SLOTS.length]!);
  }
  return slots;
}

/** 1..N 페이즈 드롭 합산 → {boxes{slot:n}} (전원 동일 지급분). */
export function aggregatePhaseDrops(
  raidId: bigint,
  phasesCleared: number,
): { boxes: Record<SupplySlot, number> } {
  const boxes: Record<SupplySlot, number> = { weapon: 0, armor: 0, accessory: 0 };
  for (let p = 1; p <= phasesCleared; p++) {
    for (const slot of phaseDropOutcome(raidId, p)) boxes[slot] += 1;
  }
  return { boxes };
}
