import { catalogRegionUi } from '@/lib/game/equipment/region-ui';
import type { CatalogRegion } from '@/lib/game/equipment/catalog';

/** 아이템 지역 칩 — 지역색 점 + 세계지도 지역명. 상세 시트·도감 상세 공용(2026-08-30). */
export function RegionTag({ region, className = '' }: { region: CatalogRegion; className?: string }) {
  const ui = catalogRegionUi(region);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-[1px] text-[10.5px] font-bold leading-tight ${className}`}
      style={{ borderColor: `${ui.color}66`, color: ui.color, backgroundColor: `${ui.color}14` }}
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: ui.color }} />
      {ui.label}
    </span>
  );
}
