/**
 * 레이드 파생 계산 — BALANCE §5. 순수 함수.
 *
 * 페이즈 돌파 수: 누적 데미지 ≥ Σ_{k=1}^{N} phase1·1.5^(k-1) 인 최대 N.
 * 드롭: **(raidId, phase[, i]) 결정론** 추첨 → 모든 참여자 동일 적용(GDD §3.5). 난이도별
 * 돌파 페이즈당 RAID_TIERS.boxesPerPhase개 + 마일스톤 도달 시 추가 상자(각 1회) — 다이아 드롭 없음.
 *
 * ⚠ 슬롯은 **균등 분배가 아니라 박스별 해시 추첨**이다(2026-08-11 주석 정정). 슬롯은
 * (raidId, phase, i) 해시로 정해진다 — 기대값만 1/3씩이고 실제 회차는 치우친다(3페이즈 돌파
 * 2,000건 실측: 2/1/0이 63.8%, 1/1/1은 31.4%, 3/0/0도 4.8%). 같은 레이드 참가자끼리는 동일하므로
 * 공정하고 편차는 회차 간 다양성이다. 슬롯별 공급량을 계산할 때 균등으로 가정하지 말 것.
 * 쉬움의 페이즈 상자(i=0)는 개편 전과 같은 해시 키라 결과가 이어진다.
 */
import {
  RAID_PHASE_HP_MULT,
  RAID_TIERS,
  SUPPLY_SLOTS,
  raidMilestoneList,
  type RaidTier,
  type SupplySlot,
} from '@/lib/game/balance';

/** 누적 데미지로 돌파한 페이즈 수. */
export function raidPhasesCleared(phase1Hp: number, totalDamage: number): number {
  if (totalDamage <= 0 || phase1Hp <= 0) return 0;
  // Σ_{k=1}^{N} phase1·r^(k-1) = phase1·(r^N − 1)/(r − 1) ≤ D
  // → r^N ≤ 1 + D·(r−1)/phase1
  const r = RAID_PHASE_HP_MULT;
  const bound = 1 + (totalDamage * (r - 1)) / phase1Hp;
  let n = Math.max(0, Math.floor(Math.log(bound) / Math.log(r)));
  // log 추정은 누적 HP에 정확히 걸린 데미지에서 1 적게(드물게 많게) 나온다 — 정산·달성 보상이 이 값을 쓰므로
  // 누적 HP(p1·(r^n−1)/(r−1), 이 크기에서 double로 정확)와 직접 비교해 보정한다(반올림한 raidCumulativeHp와 비교하면 안 됨).
  const cum = (k: number) => (phase1Hp * (Math.pow(r, k) - 1)) / (r - 1);
  while (cum(n + 1) <= totalDamage) n += 1;
  while (n > 0 && cum(n) > totalDamage) n -= 1;
  return n;
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

function hashedSlots(keyPrefix: string, count: number): SupplySlot[] {
  const slots: SupplySlot[] = [];
  for (let i = 0; i < count; i++) {
    // 박스별 다른 해시 비트 → 같은 페이즈 내 복수 박스도 결정론 분산.
    const h = fnv1a(`${keyPrefix}:${i}`);
    slots.push(SUPPLY_SLOTS[h % SUPPLY_SLOTS.length]!);
  }
  return slots;
}

/** 페이즈 1개 돌파 보상 — 난이도별 boxesPerPhase개의 보급 상자 슬롯. 결정론. */
export function phaseDropOutcome(raidId: bigint, phase: number, tier: RaidTier): SupplySlot[] {
  return hashedSlots(`${raidId.toString()}:${phase}`, RAID_TIERS[tier].boxesPerPhase);
}

/** 마일스톤(phase 도달) 보상 — 난이도별 상자 수의 슬롯. 페이즈 상자와 키 공간이 다르다(`m`). */
export function milestoneDropOutcome(raidId: bigint, phase: number, tier: RaidTier): SupplySlot[] {
  const n = RAID_TIERS[tier].milestones[phase] ?? 0;
  return hashedSlots(`${raidId.toString()}:m${phase}`, n);
}

/**
 * 1..N 페이즈 드롭 + 도달 마일스톤 합산 → 전원 동일 지급분.
 * phaseBoxes/milestoneBoxes는 표시용 내역(합 = boxes 총량).
 */
export function aggregatePhaseDrops(
  raidId: bigint,
  phasesCleared: number,
  tier: RaidTier,
): { boxes: Record<SupplySlot, number>; phaseBoxes: number; milestoneBoxes: number } {
  const boxes: Record<SupplySlot, number> = { weapon: 0, armor: 0, accessory: 0 };
  let phaseBoxes = 0;
  for (let p = 1; p <= phasesCleared; p++) {
    for (const slot of phaseDropOutcome(raidId, p, tier)) {
      boxes[slot] += 1;
      phaseBoxes += 1;
    }
  }
  let milestoneBoxes = 0;
  for (const [p] of raidMilestoneList(tier)) {
    if (phasesCleared < p) break;
    for (const slot of milestoneDropOutcome(raidId, p, tier)) {
      boxes[slot] += 1;
      milestoneBoxes += 1;
    }
  }
  return { boxes, phaseBoxes, milestoneBoxes };
}
