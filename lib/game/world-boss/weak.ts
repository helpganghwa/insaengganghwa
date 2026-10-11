/**
 * 월드보스 약점(docs/WORLD-BOSS.md §3) — 순수 모듈.
 * 소환 때 부위별 WORLD_BOSS_WEAK_PER_SLOT개를 활성 카탈로그에서 뽑아 보스 행(weak)에 고정한다 — 보스 하나에 한 묶음(10-11 사용자).
 * 뽑기는 서버 난수(crypto)로만 — 호출부가 [0,1) 난수 함수를 넘긴다(CLAUDE §3.1).
 */
import { WORLD_BOSS_WEAK_PER_SLOT } from '@/lib/game/guild/balance';
import type { WorldBossWeakSet } from '@/lib/db/schema/world-boss';

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

/** 묶음 하나(배열 길이 1 — 저장 형식) × 부위별 n개. 카탈로그가 n보다 작으면 있는 만큼. */
export function drawWorldBossWeak(catalog: CatalogBySlot, rand: () => number, n: number = WORLD_BOSS_WEAK_PER_SLOT): WorldBossWeakSet[] {
  return [{ weapon: pickN(catalog.weapon, n, rand), armor: pickN(catalog.armor, n, rand), accessory: pickN(catalog.accessory, n, rand) }];
}

/** jsonb에서 읽은 값을 안전하게 — 형식이 어긋나면 빈 배열(약점 없음). 옛 행(페이즈별 7개)은 첫 묶음만 쓴다. */
export function parseWeak(v: unknown): WorldBossWeakSet[] {
  if (!Array.isArray(v)) return [];
  return v.map((p) => {
    const o = (p && typeof p === 'object' ? p : {}) as Record<string, unknown>;
    const arr = (x: unknown) => (Array.isArray(x) ? x.filter((c): c is string => typeof c === 'string') : []);
    return { weapon: arr(o.weapon), armor: arr(o.armor), accessory: arr(o.accessory) };
  });
}

/** 슬롯 비트(재생 기록용): 무기 1 · 방어구 2 · 장신구 4. */
export const SLOT_BIT: Record<WeakSlot, number> = { weapon: 1, armor: 2, accessory: 4 };

import { WORLD_BOSS_AVATAR_BONUS, WORLD_BOSS_WEAK_BONUS } from '@/lib/game/guild/balance';

/** 그 부위에 아바타 보너스가 붙는가 — 커스텀 아바타면 약점 장비로 갈아입은 부위도 유지(simulate와 같은 규칙). */
export function avatarBonusOn(avatarMatch: boolean, hasAvatar: boolean, weak: boolean): boolean {
  return avatarMatch || (hasAvatar && weak);
}

/** 부위 하나의 월드보스 전투력(보너스 포함). weakBonus = 보스 특성(치명 약점이면 2.0). 서버(loadout)·화면(WeakPanel)이 같은 식을 쓴다. */
export function piecePower(cp: number, avatarMatch: boolean, hasAvatar: boolean, weak: boolean, weakBonus: number = WORLD_BOSS_WEAK_BONUS): number {
  const av = avatarBonusOn(avatarMatch, hasAvatar, weak);
  return cp * (1 + (av ? WORLD_BOSS_AVATAR_BONUS : 0) + (weak ? weakBonus : 0));
}
