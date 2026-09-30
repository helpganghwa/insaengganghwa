/**
 * 무한의 탑 순수 엔진(docs/TOWER.md §2) — 탑 전투력·배율, 아바타 배율, 요구 장비 추첨.
 * DB/IO 없음(단위 테스트 대상). 수치 정본은 balance.ts TOWER_*.
 */
import { TOWER_AVATAR_MULT, TOWER_POOL_PER_SLOT, towerIsSpecial, towerSection } from '@/lib/game/balance';

export type TowerSlot = 'weapon' | 'armor' | 'accessory';
export const TOWER_SLOTS: readonly TowerSlot[] = ['weapon', 'armor', 'accessory'];

/** 부위별 카탈로그 key 목록. */
export type SlotKeys = Record<TowerSlot, string[]>;

/** 그 층에서 쓰는 요구 장비 — 일반 층은 그 층 풀, 특별층은 그 층 풀 + 지정 장비(×2는 지정 장비만). */
export type FloorRule = {
  floor: number;
  /** null = 모든 장비(1~10층 입문 구간). */
  allowed: ReadonlySet<string> | null;
  /** ×2가 될 수 있는 장비 — 일반 층은 allowed 전체(null이면 전부), 특별층은 지정 장비만. */
  doubleable: ReadonlySet<string> | null;
};

export function floorRule(floor: number, pool: SlotKeys | null, specials: SlotKeys | null): FloorRule {
  // 풀이 없으면(추첨 전·실패) 빈 집합 = 모두 ×0(fail-closed) — null은 '모든 장비'라 요구 장비 제한이 통째로 풀린다(09-30 감사 M1).
  const flat = (k: SlotKeys | null) => new Set(k ? TOWER_SLOTS.flatMap((s) => k[s]) : []);
  if (towerSection(floor) === 1 && !towerIsSpecial(floor)) return { floor, allowed: null, doubleable: null };
  if (!towerIsSpecial(floor)) {
    const p = flat(pool);
    return { floor, allowed: p, doubleable: p };
  }
  // 특별층 — 그 층 요구 장비(1구간이면 전부) + 지정 장비를 장착할 수 있고, ×2는 지정 장비만.
  const sp = flat(specials);
  const base = towerSection(floor) === 1 ? null : flat(pool);
  const allowed = base ? new Set([...base, ...sp]) : null;
  return { floor, allowed, doubleable: sp };
}

export type EquippedPiece = { slot: TowerSlot; key: string; cp: number };
export type PieceScore = EquippedPiece & { mult: 0 | 1 | 2; score: number };

/**
 * 탑 전투력 — 장착 3개 각각: 요구 장비 && 아바타 생성에도 쓰임 ×2 · 요구 장비 ×1 · 아님 ×0.
 * avatarKeys가 비어 있으면(기본 아바타) 최대 ×1.
 */
export function towerCp(
  equipped: readonly EquippedPiece[],
  rule: FloorRule,
  avatarKeys: ReadonlySet<string>,
): { total: number; pieces: PieceScore[]; doubledCount: number } {
  const pieces = equipped.map((p) => {
    const ok = rule.allowed === null || rule.allowed.has(p.key);
    const dbl = ok && avatarKeys.has(p.key) && (rule.doubleable === null || rule.doubleable.has(p.key));
    const mult: 0 | 1 | 2 = !ok ? 0 : dbl ? (TOWER_AVATAR_MULT as 2) : 1;
    return { ...p, mult, score: p.cp * mult };
  });
  return {
    total: pieces.reduce((a, p) => a + p.score, 0),
    pieces,
    doubledCount: pieces.filter((p) => p.mult === 2).length,
  };
}

/** 아바타 배율 = 이 아바타로 오를 때 ÷ 아바타 없이(×1). 분모 0이면 1. 소수 둘째 자리. */
export function avatarMultiplier(equipped: readonly EquippedPiece[], rule: FloorRule, avatarKeys: ReadonlySet<string>): number {
  const withAv = towerCp(equipped, rule, avatarKeys).total;
  const base = towerCp(equipped, rule, new Set()).total;
  return base > 0 ? Math.round((withAv / base) * 100) / 100 : 1;
}

/**
 * 이 아바타로 가장 세지는 장착 — 부위마다 max(아바타 장비가 ×2 대상이면 그 장비 ×2, 가진 요구 장비 최강 ×1).
 * 아바타 선택 시 장착을 자동으로 맞출 때 쓴다(TOWER.md §7).
 */
export function bestLoadout(
  owned: ReadonlyMap<string, { slot: TowerSlot; cp: number }>,
  rule: FloorRule,
  avatarKeys: ReadonlySet<string>,
): Record<TowerSlot, string | null> {
  const out = { weapon: null, armor: null, accessory: null } as Record<TowerSlot, string | null>;
  const best = { weapon: -1, armor: -1, accessory: -1 } as Record<TowerSlot, number>;
  for (const [key, o] of owned) {
    const r = towerCp([{ slot: o.slot, key, cp: o.cp }], rule, avatarKeys);
    if (r.total > 0 && r.total > best[o.slot]) {
      best[o.slot] = r.total;
      out[o.slot] = key;
    }
  }
  return out;
}

/** 0..9999 균등 RNG. */
export type Rng10k = () => number;

/** 부위별로 n개를 뽑는다(중복 없음, 후보가 모자라면 전부). 추첨은 서버 RNG — 결과는 tower_pools에 박제. */
export function drawPool(catalog: SlotKeys, rng: Rng10k, n: number = TOWER_POOL_PER_SLOT): SlotKeys {
  const pick = (arr: string[], k: number) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor((rng() / 10000) * (i + 1));
      [a[i], a[j]] = [a[j]!, a[i]!];
    }
    return a.slice(0, k);
  };
  return { weapon: pick(catalog.weapon, n), armor: pick(catalog.armor, n), accessory: pick(catalog.accessory, n) };
}
