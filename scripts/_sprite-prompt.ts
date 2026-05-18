/**
 * 스프라이트 잡 단일 진실 원천 (side-effect 없음).
 *
 * `lib/game/equipment/catalog.ts`(CATALOG_ITEMS) → 생성 잡 목록.
 * **등급 변형 없음**(GDD §3.1 — 카탈로그 아이템당 스프라이트 1개).
 * 프롬프트는 각 아이템의 `art`(이미 Pixellab 64×64 키워드 + 스타일 포함)를 그대로 쓴다.
 * 파일 경로 = `public/sprites/<slot>/<key>.png`, key = `catalog_items.code`.
 */
import { CATALOG_ITEMS, type CatalogSlot } from '../lib/game/equipment/catalog';

export type SpriteJob = {
  /** catalog_items.code = 스프라이트 키 (전역 유니크). */
  key: string;
  slot: CatalogSlot;
  /** Pixellab 생성 프롬프트 (catalog.art 그대로). */
  prompt: string;
  /** public/sprites/ 기준 저장 경로. */
  file: string;
};

export function buildSpriteJobs(): SpriteJob[] {
  return CATALOG_ITEMS.map((c) => ({
    key: c.key,
    slot: c.slot,
    prompt: c.art,
    file: `${c.slot}/${c.key}.png`,
  }));
}
