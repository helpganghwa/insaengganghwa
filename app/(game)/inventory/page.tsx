import Link from 'next/link';
import { getActiveServerId } from '@/lib/game/servers';
import { sql } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { withTimeout } from '@/lib/db/with-timeout';
import { type Slot } from '@/lib/db/schema/equipment';
import { getCatalogMap, completeCatalog } from '@/lib/game/catalog';
import { liberatedItemRanks } from '@/lib/game/codex/ranking';
import { loreByCode } from '@/lib/game/equipment/lore';

import { InventoryGrid, type InvItem } from './InventoryGrid';

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ slot?: string }>;
}) {
  const userId = await getSessionUserId();
  const serverId = await getActiveServerId();
  if (!userId) return null;
  const { slot } = await searchParams;
  const initialSlot: Slot | 'all' =
    slot === 'weapon' || slot === 'armor' || slot === 'accessory' ? slot : 'all';

  // 장비 인스턴스·진행중 강화·닉네임을 **단일 SQL 1왕복**으로(json 동봉). bigint id는 text,
  // 취득시각은 epoch ms로 직렬화(json은 Date 미보존). liberatedItemRanks(캐시 쿼리)·
  // getCatalogMap(캐시)만 병렬 → 4 DB왕복 → 2. 콜드/hang 시 빈 결과로 degrade(CLAUDE §11.4).
  type InvRow = {
    nickname: string | null;
    equipment: {
      id: string;
      catalogItemId: number;
      enhanceLevel: number;
      transcendLevel: number;
      transcendProgress: number;
      equippedSlot: string | null;
      acquiredAtMs: number;
    }[];
    running: string[];
  };
  const _r = await withTimeout(
    Promise.all([
      db.execute(sql`
        select
          (select nickname from characters where user_id = ${userId}::uuid and server_id = ${serverId}) as nickname,
          coalesce((select json_agg(json_build_object(
              'id', id::text, 'catalogItemId', catalog_item_id, 'enhanceLevel', enhance_level,
              'transcendLevel', transcend_level, 'transcendProgress', transcend_progress,
              'equippedSlot', equipped_slot,
              'acquiredAtMs', (extract(epoch from first_acquired_at) * 1000)::bigint))
            from user_equipment where user_id = ${userId}::uuid and server_id = ${serverId}), '[]'::json) as equipment,
          coalesce((select json_agg(user_equipment_id::text)
            from enhancement_jobs
            where user_id = ${userId}::uuid and server_id = ${serverId} and status = 'running'), '[]'::json) as running
      `) as unknown as Promise<InvRow[]>,
      liberatedItemRanks(userId, serverId),
      getCatalogMap(), // 불변 카탈로그(캐시) — 조인 제거, in-memory 결합.
    ]),
    3500,
    'inventory.page',
  ).catch(() => null);
  const row = _r?.[0]?.[0] ?? null;
  const libRanks = _r?.[1] ?? new Map<number, number>();
  const catMap = _r?.[2] ?? new Map();
  const equipmentRows = row?.equipment ?? [];
  // 캐시에 없는 신규 카탈로그 보강 — 추가돼도 인벤에서 누락되지 않게.
  await completeCatalog(catMap, equipmentRows.map((r) => r.catalogItemId));
  const nickname = row?.nickname ?? '플레이어';

  const busy = new Set(row?.running ?? []);
  const items: InvItem[] = equipmentRows.flatMap((r) => {
    const cat = catMap.get(r.catalogItemId);
    if (!cat) return [];
    return [
      {
        id: r.id,
        catalogItemId: r.catalogItemId,
        code: cat.code,
        name: cat.name,
        slot: cat.slot,
        enhanceLevel: r.enhanceLevel,
        transcendLevel: r.transcendLevel,
        transcendProgress: r.transcendProgress,
        equipped: r.equippedSlot != null,
        acquiredAtMs: r.acquiredAtMs,
        busy: busy.has(r.id),
        championRank: libRanks.get(r.catalogItemId) ?? null,
        lore: loreByCode(cat.code),
      },
    ];
  });

  return (
    <div className="px-4 py-4">
      {items.length === 0 ? (
        <Link
          href="/gacha"
          className="block rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50/40 p-8 text-center text-sm transition active:opacity-70 dark:border-amber-800 dark:bg-amber-950/20"
        >
          첫 장비가 없습니다. <span className="font-bold text-amber-700 dark:text-amber-300">보급 상자를 열어보세요</span>
        </Link>
      ) : (
        <InventoryGrid items={items} initialSlot={initialSlot} nickname={nickname} />
      )}
    </div>
  );
}
