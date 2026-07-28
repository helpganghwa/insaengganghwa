import type { CatalogRegion } from '@/lib/game/equipment/catalog';
import { CATALOG_ITEMS } from '@/lib/game/equipment/catalog';
import type { AttrRegion } from '@/lib/game/balance';

/**
 * 카탈로그 지역(한글 세계관 명칭) → 속성 지역. '일반'·미매핑은 null(속성 없음).
 * 세계관 표기가 지역 6종보다 세분화돼 있어(서쪽 화산·고대 룬 산맥 등) 여기서 흡수한다.
 */
const MAP: Record<string, AttrRegion | null> = {
  왕국: 'kingdom',
  늪지대: 'swamp',
  화산: 'volcano',
  '서쪽 화산': 'volcano',
  신전: 'temple',
  '고대 룬 산맥': 'temple',
  타락천사: 'angel',
  '오크 부락': 'orc',
  일반: null,
};

export function attrRegionOfCatalogRegion(region: CatalogRegion | string | null | undefined) {
  return region ? (MAP[region] ?? null) : null;
}

/** 아이템 key(=catalog code) → 속성 지역. 미존재 키는 null. */
const BY_KEY = new Map<string, AttrRegion | null>(
  CATALOG_ITEMS.map((i) => [i.key, attrRegionOfCatalogRegion(i.region)]),
);

export function attrRegionOfItemKey(key: string | null | undefined): AttrRegion | null {
  return key ? (BY_KEY.get(key) ?? null) : null;
}
