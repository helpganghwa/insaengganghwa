/**
 * 파견 순수 엔진(EXPEDITION.md A′) — 미션 롤·보상 롤·시너지·대성공.
 *
 * 이 파일은 **DB/IO 없는 순수 함수만** 둔다(단위 테스트 대상). RNG는 주입식 —
 * 실호출은 서버 crypto(rng10k), 테스트는 결정론 스텁. 수치 정본은 balance.ts EXPEDITION_*.
 */
import {
  EXPEDITION_BASE_AMOUNTS,
  EXPEDITION_CRIT_MULT,
  EXPEDITION_DURATION_MS,
  EXPEDITION_MAIN_ROLL_BP,
  EXPEDITION_REGIONS,
  expeditionSlotsFor,
  expeditionWeightedSum,
  expeditionAsBonusBp,
  expeditionCritBp,
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
  durationMs: number;
  reward: ExpeditionReward;
};

/**
 * 아바타 강화 합(AS) — 생성 스냅샷(카탈로그 key 3종)에 대응하는 내 장비의 **현재** enhance_level 합.
 * 스냅샷 없음(기본 아바타)·미보유 key는 0. 카탈로그당 1레코드라 key→레벨 1:1.
 */
export function avatarEnhanceSum(snapshot: unknown, levelByKey: ReadonlyMap<string, number>): number {
  if (!snapshot || typeof snapshot !== 'object') return 0;
  const keys = Object.values(snapshot as Record<string, unknown>).filter(
    (v): v is string => typeof v === 'string',
  );
  let sum = 0;
  for (const k of keys.slice(0, 3)) sum += levelByKey.get(k) ?? 0;
  return sum;
}

/** 아바타 강화 합 배율(bp) — balance의 M(AS) 정본(엔진 경유 단일 진입). 시너지와 bp 합산. */
export function asBonusBp(avatarSum: number): number {
  return expeditionAsBonusBp(avatarSum);
}

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

/** 상자 슬롯 분배 — 부위 3종 균등 랜덤. region 인자는 호출부 호환용. */
export function rollBoxSlots(
  rng: Rng10k,
  _region: ExpeditionRegion,
  n: number,
): { weapon: number; armor: number; accessory: number } {
  const slots = ['weapon', 'armor', 'accessory'] as const;
  const out = { weapon: 0, armor: 0, accessory: 0 };
  for (let i = 0; i < n; i++) out[slots[Math.floor((rng() / 10000) * 3) % 3]!] += 1;
  return out;
}

/**
 * 미션 오퍼 롤(A′) — 지역 균등 × 본상 사전 확정. 시간은 단일(EXPEDITION_DURATION_MS)이라 롤하지 않는다.
 * 대성공은 여기서 롤하지 않는다(수령 시 판정).
 * rng 순서: 지역 → 본상 분기 → 수량 → (상자면) 부위 n회.
 */
export function rollMission(rng: Rng10k): ExpeditionMission {
  const region = EXPEDITION_REGIONS[rng() % EXPEDITION_REGIONS.length]!;
  const kind = pickWeighted(rng, EXPEDITION_MAIN_ROLL_BP) as 'boxOnly' | 'diamondOnly' | 'both';
  const a = EXPEDITION_BASE_AMOUNTS;
  let reward: ExpeditionReward;
  if (kind === 'boxOnly') {
    const n = uniformInt(rng, a.boxOnly.boxMin, a.boxOnly.boxMax);
    reward = { kind: 'box', boxes: rollBoxSlots(rng, region, n) };
  } else if (kind === 'diamondOnly') {
    reward = { kind: 'dia', diamond: uniformInt(rng, a.diamondOnly.diaMin, a.diamondOnly.diaMax) };
  } else {
    const n = uniformInt(rng, a.both.boxMin, a.both.boxMax);
    reward = {
      kind: 'both',
      boxes: rollBoxSlots(rng, region, n),
      diamond: uniformInt(rng, a.both.diaMin, a.both.diaMax),
    };
  }
  return { region, durationMs: EXPEDITION_DURATION_MS, reward };
}

/* ── 시너지(§3.2) — 배정 아바타 장비 스냅샷 기준 ── */

/** 카탈로그 한글 지역 → 파견 지역 코드. '일반'은 범용. 레거시·미상은 무보정. */
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
const ITEM_BY_KEY = new Map(CATALOG_ITEMS.map((c) => [c.key, c]));

/** 아바타 스냅샷 장비 3종 상세 — 배정 팝업 "왜 이 배율인가" 설명용(이름·부위·파견 지역·현재 강화). */
export type SnapshotEquipment = {
  key: string;
  slot: 'weapon' | 'armor' | 'accessory';
  name: string;
  /** 파견 지역 매핑(일치 ×1.3 / 일반 ×1.15) — 미매핑은 null(보너스 없음). */
  region: ExpeditionRegion | 'general' | null;
  level: number;
};
export function snapshotEquipment(snapshot: unknown, levelByKey: ReadonlyMap<string, number>): SnapshotEquipment[] {
  if (!snapshot || typeof snapshot !== 'object') return [];
  const keys = Object.values(snapshot as Record<string, unknown>).filter((v): v is string => typeof v === 'string');
  return keys.slice(0, 3).flatMap((k) => {
    const c = ITEM_BY_KEY.get(k);
    if (!c) return [];
    return [{ key: k, slot: c.slot, name: c.nameKo, region: CATALOG_TO_EXPEDITION[c.region] ?? null, level: levelByKey.get(k) ?? 0 }];
  });
}

/** 스냅샷의 장비 지역 목록(UI 배지·클라 시너지 계산용) — 미매핑은 제외. */
export function snapshotExpeditionRegions(snapshot: unknown): (ExpeditionRegion | 'general')[] {
  if (!snapshot || typeof snapshot !== 'object') return [];
  const keys = Object.values(snapshot as Record<string, unknown>).filter(
    (v): v is string => typeof v === 'string',
  );
  return keys
    .slice(0, 3)
    .map((k) => CATALOG_TO_EXPEDITION[REGION_BY_KEY.get(k) as CatalogRegion])
    .filter((v): v is ExpeditionRegion | 'general' => !!v);
}

/**
 * 아바타 가중 강화 합(시너지 적용) — 스냅샷 장비 3종의 강화 레벨에 미션 지역 일치 ×1.3 / 일반 ×1.15를
 * 곱해 합산. 이 값이 M(AS)로 들어간다.
 */
export function avatarWeightedSum(snapshot: unknown, levelByKey: ReadonlyMap<string, number>, missionRegion: ExpeditionRegion): number {
  return expeditionWeightedSum(
    snapshotEquipment(snapshot, levelByKey).map((e) => ({ level: e.level, region: e.region })),
    missionRegion,
  );
}

/** 계정 합산 강화 → 대성공 확률(bp) — balance.expeditionCritBp 정본(엔진 경유 단일 진입). */
export function critBp(enhanceSum = 0): number {
  return expeditionCritBp(enhanceSum);
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

/** 실효 슬롯 수 — 계정 합산 강화만으로 결정(0~4). 구매·레벨 해금 없음. */
export function effectiveSlots(enhanceSum: number): number {
  return expeditionSlotsFor(enhanceSum);
}
