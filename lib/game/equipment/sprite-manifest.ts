// 2026-05-24: catalog-next 기반 동적 manifest.
// key = catalog_items.code. 값 = /public 기준 스프라이트 경로.
// catalog 변경 시 자동 반영. 편성에서 빠진 아이템도 포함한다 — 보유 중인 유저의
// 장비가 그림을 잃지 않도록(CATALOG_ALL).
import { CATALOG_ALL } from './catalog';

export const SPRITE_MANIFEST: Record<string, string> = Object.fromEntries(
  CATALOG_ALL.map((c) => [c.key, `/sprites/${c.slot}/${c.key}.png`]),
);

export function spritePath(code: string): string | null {
  return SPRITE_MANIFEST[code] ?? null;
}
