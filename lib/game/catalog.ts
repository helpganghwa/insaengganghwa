import 'server-only';

import { unstable_cache } from 'next/cache';
import { eq, inArray, or } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { catalogItems, type Slot } from '@/lib/db/schema/equipment';
import { CHUSEOK_ITEM_CODES, chuseokItemsOpen } from '@/lib/game/chuseok/config';

export type CatalogItem = { id: number; code: string; name: string; slot: Slot };

/**
 * 활성 카탈로그(불변/준불변) — CLAUDE §11.5. 카탈로그는 출시/밸런스 갱신 때만 바뀌므로
 * 요청 경로에서 DB 조회를 제거(캐시). 변경은 드물어 10분 revalidate + 'catalog' 태그.
 * 핫패스(도감·강화·인벤·가챠)에서 공유 호출해 풀 압박/왕복을 줄인다.
 */
const getActiveCatalogCached = unstable_cache(
  async (): Promise<(CatalogItem & { active: boolean })[]> =>
    db
      .select({
        id: catalogItems.id,
        code: catalogItems.code,
        name: catalogItems.name,
        slot: catalogItems.slot,
        active: catalogItems.active,
      })
      .from(catalogItems)
      // 한가위 6종은 비활성이어도 캐시에 싣는다 — 노출 여부는 아래에서 **서버 시각**으로 판정(2026-09-23).
      // 캐시(최대 10분)에 시각 판정을 넣으면 자정 직전 캐시가 자정 뒤까지 옛 목록을 내보낸다.
      .where(or(eq(catalogItems.active, true), inArray(catalogItems.code, [...CHUSEOK_ITEM_CODES]))),
  ['active-catalog-v2'],
  // 강제 무효화: POST /api/admin/revalidate?tag=catalog — 카탈로그 전환 스크립트 후 필수
  // (안 쏘면 확률 공시가 최대 10분 구 데이터 = §33 공시-판정 불일치 창).
  { revalidate: 600, tags: ['catalog'] },
);

const CHUSEOK_CODE_SET = new Set(CHUSEOK_ITEM_CODES);

/** 지금 노출·추첨 대상인 카탈로그 — 활성 행 + 한가위 6종(시작 시각 이후). 보급 풀(supply/open.ts)과 같은 판정. */
export async function getActiveCatalog(): Promise<CatalogItem[]> {
  const rows = await getActiveCatalogCached();
  const open = chuseokItemsOpen();
  return rows
    .filter((r) => r.active || (open && CHUSEOK_CODE_SET.has(r.code)))
    .map(({ id, code, name, slot }) => ({ id, code, name, slot }));
}

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

/**
 * 캐시 맵에 없는 id(= 캐시 revalidate 전에 **새로 추가된** 카탈로그)를 DB로 보강.
 * 카탈로그는 추가만 되고 삭제는 없다는 전제 — 캐시에 다 있으면 DB를 치지 않고(공통),
 * 신규 아이템을 막 획득한 경우에만 누락분만 타깃 조회해 **절대 누락되지 않게** 한다.
 * map은 getCatalogMap이 매번 새로 만든 Map이므로 직접 set해도 캐시에 영향 없음.
 */
export async function completeCatalog(
  map: Map<number, CatalogItem>,
  ids: Iterable<number>,
): Promise<void> {
  const missing = [...new Set([...ids])].filter((id) => !map.has(id));
  if (missing.length === 0) return;
  const rows = await db
    .select({
      id: catalogItems.id,
      code: catalogItems.code,
      name: catalogItems.name,
      slot: catalogItems.slot,
    })
    .from(catalogItems)
    .where(inArray(catalogItems.id, missing));
  for (const r of rows) map.set(r.id, r);
}
