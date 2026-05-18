/**
 * 레이드 파생 계산 — BALANCE §5. 순수 함수.
 *
 * 페이즈 돌파 수: 누적 데미지 ≥ Σ_{k=1}^{N} phase1·1.5^(k-1) 인 최대 N.
 * 페이즈 드롭: **(raidId, phase) 결정론** 추첨 → 모든 참여자 동일 적용(GDD §3.5).
 */
import {
  RAID_PHASE_DROP_DIAMOND,
  RAID_PHASE_DROP_DIAMOND_RATE_BP,
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

export type PhaseDrop =
  | { kind: 'diamond'; amount: number }
  | { kind: 'box'; slot: SupplySlot };

/** 페이즈 1개 돌파 보상 — 50% 100다이아 / 50% 슬롯 랜덤 보급 상자(1/3). 결정론. */
export function phaseDropOutcome(raidId: bigint, phase: number): PhaseDrop {
  const h = fnv1a(`${raidId.toString()}:${phase}`);
  if (h % 10000 < RAID_PHASE_DROP_DIAMOND_RATE_BP) {
    return { kind: 'diamond', amount: RAID_PHASE_DROP_DIAMOND };
  }
  // 슬롯 균등 1/3 — 다른 해시 비트로 결정.
  const slot = SUPPLY_SLOTS[(h >>> 16) % SUPPLY_SLOTS.length]!;
  return { kind: 'box', slot };
}

/** 1..N 페이즈 드롭 합산 → {diamond, boxes{slot:n}} (전원 동일 지급분). */
export function aggregatePhaseDrops(
  raidId: bigint,
  phasesCleared: number,
): { diamond: number; boxes: Record<SupplySlot, number> } {
  const boxes: Record<SupplySlot, number> = { weapon: 0, armor: 0, accessory: 0 };
  let diamond = 0;
  for (let p = 1; p <= phasesCleared; p++) {
    const d = phaseDropOutcome(raidId, p);
    if (d.kind === 'diamond') diamond += d.amount;
    else boxes[d.slot] += 1;
  }
  return { diamond, boxes };
}
