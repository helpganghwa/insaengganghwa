/**
 * 월드보스 페이즈 약점(docs/WORLD-BOSS.md §3) — 순수 모듈.
 * 소환 때 페이즈마다 부위별 WORLD_BOSS_WEAK_PER_SLOT개를 활성 카탈로그에서 뽑아 보스 행(weak)에 고정한다.
 * 뽑기는 서버 난수(crypto)로만 — 호출부가 [0,1) 난수 함수를 넘긴다(CLAUDE §3.1).
 */
import { WORLD_BOSS_PHASES, WORLD_BOSS_WEAK_PER_SLOT } from '@/lib/game/guild/balance';
import type { WorldBossWeakPhase } from '@/lib/db/schema/world-boss';

export type WeakSlot = 'weapon' | 'armor' | 'accessory';
export const WEAK_SLOTS: readonly WeakSlot[] = ['weapon', 'armor', 'accessory'];
export type CatalogBySlot = Record<WeakSlot, readonly string[]>;

function pickN(codes: readonly string[], n: number, rand: () => number): string[] {
  const a = [...codes];
  const k = Math.min(n, a.length);
  for (let i = 0; i < k; i++) {
    const j = i + Math.floor(rand() * (a.length - i));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a.slice(0, k);
}

/** 페이즈 WORLD_BOSS_PHASES개 × 부위별 n개. 카탈로그가 n보다 작으면 있는 만큼. */
export function drawWorldBossWeak(catalog: CatalogBySlot, rand: () => number, n: number = WORLD_BOSS_WEAK_PER_SLOT): WorldBossWeakPhase[] {
  return Array.from({ length: WORLD_BOSS_PHASES }, () => ({
    weapon: pickN(catalog.weapon, n, rand),
    armor: pickN(catalog.armor, n, rand),
    accessory: pickN(catalog.accessory, n, rand),
  }));
}

/** jsonb에서 읽은 값을 안전하게 — 형식이 어긋나면 빈 배열(약점 없음). */
export function parseWeak(v: unknown): WorldBossWeakPhase[] {
  if (!Array.isArray(v)) return [];
  return v.map((p) => {
    const o = (p && typeof p === 'object' ? p : {}) as Record<string, unknown>;
    const arr = (x: unknown) => (Array.isArray(x) ? x.filter((c): c is string => typeof c === 'string') : []);
    return { weapon: arr(o.weapon), armor: arr(o.armor), accessory: arr(o.accessory) };
  });
}

/** 슬롯 비트(재생 기록용): 무기 1 · 방어구 2 · 장신구 4. */
export const SLOT_BIT: Record<WeakSlot, number> = { weapon: 1, armor: 2, accessory: 4 };
