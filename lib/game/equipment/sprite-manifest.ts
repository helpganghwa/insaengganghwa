// 2026-05-24: catalog-next 기반 동적 manifest.
// key = catalog_items.code. 값 = /public 기준 스프라이트 경로.
// catalog 변경 시 자동 반영.
import { CATALOG_ITEMS } from './catalog';

export const SPRITE_MANIFEST: Record<string, string> = Object.fromEntries(
  CATALOG_ITEMS.map((c) => [c.key, `/sprites/${c.slot}/${c.key}.png`]),
);

export function spritePath(code: string): string | null {
  return SPRITE_MANIFEST[code] ?? null;
}
