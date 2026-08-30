/**
 * 아이템 지역 표시(2026-08-30) — 카탈로그 region 값(늪지대·화산·신전·타락천사…)을 유저에게 보이는
 * **세계지도 지역명·지역색**으로 통일한다(파견 REGION_UI와 같은 색). '일반'은 회색.
 * 순수 모듈(서버/클라 공용) — 카탈로그 상수만 읽는다.
 */
import type { CatalogRegion } from './catalog';

export type RegionUi = { key: string; label: string; color: string };

const REGION_UI_BY_CATALOG: Record<CatalogRegion, RegionUi> = {
  늪지대: { key: 'swamp', label: '슬라임 늪', color: '#22c55e' },
  '오크 부락': { key: 'orc', label: '오크 부락', color: '#f97316' },
  왕국: { key: 'kingdom', label: '왕국', color: '#fbbf24' },
  신전: { key: 'temple', label: '잊힌 신전', color: '#60a5fa' },
  화산: { key: 'volcano', label: '드래곤 화산', color: '#ef4444' },
  타락천사: { key: 'angel', label: '타락 천사 부유섬', color: '#c084fc' },
  // 레거시 값(현재 카탈로그 0종) — 안전 매핑.
  '고대 룬 산맥': { key: 'temple', label: '잊힌 신전', color: '#60a5fa' },
  '서쪽 화산': { key: 'volcano', label: '드래곤 화산', color: '#ef4444' },
  일반: { key: 'general', label: '일반', color: '#a1a1aa' },
};

export function catalogRegionUi(region: CatalogRegion): RegionUi {
  return REGION_UI_BY_CATALOG[region] ?? REGION_UI_BY_CATALOG['일반'];
}

/** 필터·목록용 지역 순서(세계지도 순) + 일반. */
export const REGION_FILTER_ORDER: CatalogRegion[] = ['늪지대', '오크 부락', '왕국', '신전', '화산', '타락천사', '일반'];
