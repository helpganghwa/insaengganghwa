/**
 * 카탈로그 code(key) → region. 서버 컴포넌트/페이지에서만 쓴다 — CATALOG_ITEMS(로어 포함) 전체를
 * 클라이언트 번들에 끌어오지 않기 위해 region-ui(순수 라벨 맵)와 분리(2026-08-30).
 */
import { CATALOG_ITEMS, type CatalogRegion } from './catalog';

const REGION_BY_CODE = new Map(CATALOG_ITEMS.map((c) => [c.key, c.region]));
export function regionOfCode(code: string): CatalogRegion {
  return REGION_BY_CODE.get(code) ?? '일반';
}
