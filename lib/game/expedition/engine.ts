/**
 * 파견 순수 엔진(EXPEDITION.md A′) — 미션 롤·보상 롤·시너지·레벨.
 *
 * 이 파일은 **DB/IO 없는 순수 함수만** 둔다(단위 테스트 대상). RNG는 주입식 —
 * 실호출은 서버 crypto(rng10k), 테스트는 결정론 스텁. 수치 정본은 balance.ts EXPEDITION_*.
 */
import {
  EXPEDITION_BASE_AMOUNTS,
  EXPEDITION_BOX_MAIN_BP,
  EXPEDITION_BOX_MAIN_SLOT,
  EXPEDITION_CRIT_MULT,
  EXPEDITION_DIFFICULTY_HOURS,
  EXPEDITION_DURATION_SCALE,
  EXPEDITION_LEVEL_BONUS_BP_PER,
  EXPEDITION_LEVEL_MAX,
  EXPEDITION_MAIN_ROLL_BP,
  EXPEDITION_REGIONS,
  EXPEDITION_SLOT_UNLOCKS,
  EXPEDITION_SLOTS,
  EXPEDITION_SYNERGY_GENERAL_BP,
  EXPEDITION_SYNERGY_MATCH_BP,
  expeditionDifficultyDist,
  expeditionXpToNext,
  type ExpeditionDifficulty,
  type ExpeditionDurationH,
  type ExpeditionRegion,
} from '@/lib/game/balance';
import { CATALOG_ITEMS, type CatalogRegion } from '@/lib/game/equipment/catalog';

/** 0..9999 균등 — 서버 권위 RNG(§3.1). */
export type Rng10k = () => number;
export const cryptoRng10k: Rng10k = () => crypto.getRandomValues(new Uint32Array(1))[0]! % 10000;

/** 사전 확정 보상(오퍼 롤 결과) — expeditions.reward/final_reward jsonb 형태. */
export type ExpeditionReward = {
  kind: 'box' | 'dia' | 'both';
  boxes?: { weapon: number; armor: number; accessory: number };
  diamond?: number;
};

export type ExpeditionMission = {
  region: ExpeditionRegion;
  difficulty: ExpeditionDifficulty;
  durationMs: number;
  reward: ExpeditionReward;
};

const HOUR_MS = 3_600_000;

/** min~max 균등 정수(양끝 포함). */
function uniformInt(rng: Rng10k, min: number, max: number): number {
  if (max <= min) return min;
  return min + (rng() % (max - min + 1));
}

/** bp 가중 선택 — 누적 구간. 합이 10000이어야 한다(테스트 불변식). */
function pickWeighted<K extends string>(rng: Rng10k, weights: Record<K, number>): K {
  const roll = rng();
  let acc = 0;
  const keys = Object.keys(weights) as K[];
  for (const k of keys) {
    acc += weights[k];
    if (roll < acc) return k;
  }
  return keys[keys.length - 1]!;
}

/** 지역별 상자 슬롯 분배 — 주력 60% / 나머지 20%×2, n개를 개별 롤. */
export function rollBoxSlots(
  rng: Rng10k,
  region: ExpeditionRegion,
  n: number,
): { weapon: number; armor: number; accessory: number } {
  const main = EXPEDITION_BOX_MAIN_SLOT[region];
  const others = (['weapon', 'armor', 'accessory'] as const).filter((s) => s !== main);
  const sideBp = (10000 - EXPEDITION_BOX_MAIN_BP) / 2;
  const out = { weapon: 0, armor: 0, accessory: 0 };
  for (let i = 0; i < n; i++) {
    const r = rng();
    if (r < EXPEDITION_BOX_MAIN_BP) out[main] += 1;
    else if (r < EXPEDITION_BOX_MAIN_BP + sideBp) out[others[0]!] += 1;
    else out[others[1]!] += 1;
  }
  return out;
}

/** 수량 스케일 적용 — 최소 1 보장(쉬움 4h ×0.55에서 0개 방지). */
function scaled(base: number, scale: number): number {
  return Math.max(1, Math.round(base * scale));
}

/**
 * 미션 오퍼 롤(A′) — 지역 균등 × 난이도(파견 레벨 구간 분포) × 본상 사전 확정.
 * 대성공은 여기서 롤하지 않는다(수령 시 판정 — 2026-08-25 확정).
 */
export function rollMission(rng: Rng10k, level: number): ExpeditionMission {
  const region = EXPEDITION_REGIONS[rng() % EXPEDITION_REGIONS.length]!;
  const difficulty = pickWeighted(rng, expeditionDifficultyDist(level));
  const hours = EXPEDITION_DIFFICULTY_HOURS[difficulty] as ExpeditionDurationH;
  const scale = EXPEDITION_DURATION_SCALE[hours];
  const kind = pickWeighted(rng, EXPEDITION_MAIN_ROLL_BP) as 'boxOnly' | 'diamondOnly' | 'both';
  const a = EXPEDITION_BASE_AMOUNTS;
  let reward: ExpeditionReward;
  if (kind === 'boxOnly') {
    const n = scaled(uniformInt(rng, a.boxOnly.boxMin, a.boxOnly.boxMax), scale);
    reward = { kind: 'box', boxes: rollBoxSlots(rng, region, n) };
  } else if (kind === 'diamondOnly') {
    reward = { kind: 'dia', diamond: scaled(uniformInt(rng, a.diamondOnly.diaMin, a.diamondOnly.diaMax), scale) };
  } else {
    const n = scaled(uniformInt(rng, a.both.boxMin, a.both.boxMax), scale);
    reward = {
      kind: 'both',
      boxes: rollBoxSlots(rng, region, n),
      diamond: scaled(uniformInt(rng, a.both.diaMin, a.both.diaMax), scale),
    };
  }
  return { region, difficulty, durationMs: hours * HOUR_MS, reward };
}

/* ── 시너지(§3.2) — 배정 아바타 장비 스냅샷 기준 ── */

/** 카탈로그 한글 지역 → 파견 지역 코드. '일반'은 범용(+5%/개). 레거시·미상은 무보정. */
const CATALOG_TO_EXPEDITION: Partial<Record<CatalogRegion, ExpeditionRegion | 'general'>> = {
  늪지대: 'swamp',
  '오크 부락': 'orc',
  왕국: 'kingdom',
  신전: 'temple',
  화산: 'volcano',
  타락천사: 'angel',
  일반: 'general',
};
const REGION_BY_KEY = new Map(CATALOG_ITEMS.map((c) => [c.key, c.region]));

/** 아바타 equipmentSnapshot(카탈로그 key 3종) → 미션 지역 시너지(bp). */
export function synergyBpForSnapshot(
  snapshot: unknown,
  missionRegion: ExpeditionRegion,
): number {
  if (!snapshot || typeof snapshot !== 'object') return 0;
  const keys = Object.values(snapshot as Record<string, unknown>).filter(
    (v): v is string => typeof v === 'string',
  );
  let bp = 0;
  for (const key of keys.slice(0, 3)) {
    const mapped = CATALOG_TO_EXPEDITION[REGION_BY_KEY.get(key) as CatalogRegion];
    if (mapped === missionRegion) bp += EXPEDITION_SYNERGY_MATCH_BP;
    else if (mapped === 'general') bp += EXPEDITION_SYNERGY_GENERAL_BP;
  }
  return bp;
}

/** 레벨 보너스(bp) — 상한 Lv.50. */
export function levelBonusBp(level: number): number {
  return Math.min(level, EXPEDITION_LEVEL_MAX) * EXPEDITION_LEVEL_BONUS_BP_PER;
}

/** 배율 적용(시작 시 최종 확정) — 상자·다이아 수량에만. floor가 아닌 round(공시 문구와 정합). */
export function applyMultiplier(reward: ExpeditionReward, totalBp: number): ExpeditionReward {
  const m = 1 + totalBp / 10000;
  const scaleN = (n: number) => Math.max(1, Math.round(n * m));
  return {
    kind: reward.kind,
    ...(reward.boxes
      ? {
          boxes: {
            weapon: reward.boxes.weapon ? scaleN(reward.boxes.weapon) : 0,
            armor: reward.boxes.armor ? scaleN(reward.boxes.armor) : 0,
            accessory: reward.boxes.accessory ? scaleN(reward.boxes.accessory) : 0,
          },
        }
      : {}),
    ...(reward.diamond ? { diamond: scaleN(reward.diamond) } : {}),
  };
}

/** 대성공 적용(수령 시) — 수량 ×2. */
export function applyCrit(reward: ExpeditionReward): ExpeditionReward {
  const s = (n: number) => n * EXPEDITION_CRIT_MULT;
  return {
    kind: reward.kind,
    ...(reward.boxes
      ? { boxes: { weapon: s(reward.boxes.weapon), armor: s(reward.boxes.armor), accessory: s(reward.boxes.accessory) } }
      : {}),
    ...(reward.diamond ? { diamond: s(reward.diamond) } : {}),
  };
}

/* ── 레벨/슬롯 ── */

/** XP 가산 + 레벨업 — 잔여 XP 규약(길드 xp와 동일: 비교는 (level, xp) 사전식). */
export function applyExpeditionXp(
  level: number,
  xp: bigint,
  gainH: number,
): { level: number; xp: bigint } {
  let lv = level;
  let rem = xp + BigInt(gainH);
  while (lv < EXPEDITION_LEVEL_MAX && rem >= BigInt(expeditionXpToNext(lv))) {
    rem -= BigInt(expeditionXpToNext(lv));
    lv += 1;
  }
  // 만렙 도달 후 잔여 XP는 다음 임계 미만으로 클램프하지 않고 그대로 둔다(표시는 게이지 100%).
  return { level: lv, xp: rem };
}

/** 실효 슬롯 수 = max(구매분, 레벨 무료 해금분). */
export function effectiveSlots(level: number, purchased: number): number {
  let byLevel = 1;
  for (const u of EXPEDITION_SLOT_UNLOCKS) if (level >= u.level) byLevel = Math.max(byLevel, u.slot);
  return Math.max(1, Math.min(EXPEDITION_SLOTS, Math.max(purchased, byLevel)));
}
