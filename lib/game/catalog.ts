import 'server-only';

import { unstable_cache } from 'next/cache';
import { eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { catalogItems, type Slot } from '@/lib/db/schema/equipment';

export type CatalogItem = { id: number; code: string; name: string; slot: Slot };

/**
 * 활성 카탈로그(불변/준불변) — CLAUDE §11.5. 카탈로그는 출시/밸런스 갱신 때만 바뀌므로
 * 요청 경로에서 DB 조회를 제거(캐시). 변경은 드물어 10분 revalidate + 'catalog' 태그.
 * 핫패스(도감·강화·인벤·가챠)에서 공유 호출해 풀 압박/왕복을 줄인다.
 */
export const getActiveCatalog = unstable_cache(
  async (): Promise<CatalogItem[]> =>
    db
      .select({
        id: catalogItems.id,
        code: catalogItems.code,
        name: catalogItems.name,
        slot: catalogItems.slot,
      })
      .from(catalogItems)
      .where(eq(catalogItems.active, true)),
  ['active-catalog-v1'],
  { revalidate: 600, tags: ['catalog'] },
);

/**
 * 전체 카탈로그(active 무관) — 보유 아이템이 비활성 카탈로그여도 메타 조인이 되도록.
 * 핫패스(인벤·강화·내프로필)에서 userEquipment ⨝ catalogItems 조인을 제거하고 이 캐시 맵으로
 * in-memory 조인 → DB는 per-user user_equipment 단일 테이블만 조회(불변 카탈로그 read 제거).
 * 게임 상태 아님·per-user 아님이라 낙관적 UI/치팅방지에 무영향.
 */
const getAllCatalog = unstable_cache(
  async (): Promise<CatalogItem[]> =>
    db
      .select({
        id: catalogItems.id,
        code: catalogItems.code,
        name: catalogItems.name,
        slot: catalogItems.slot,
      })
      .from(catalogItems),
  ['all-catalog-v1'],
  { revalidate: 600, tags: ['catalog'] },
);

export async function getCatalogMap(): Promise<Map<number, CatalogItem>> {
  return new Map((await getAllCatalog()).map((c) => [c.id, c]));
}
