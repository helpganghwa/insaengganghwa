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
