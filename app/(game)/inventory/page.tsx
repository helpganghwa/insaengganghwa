import { and, eq } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { withTimeout } from '@/lib/db/with-timeout';
import { catalogItems, userEquipment, type Slot } from '@/lib/db/schema/equipment';
import { enhancementJobs } from '@/lib/db/schema/enhance';
import { profiles } from '@/lib/db/schema/profiles';
import { liberatedItemRanks } from '@/lib/game/codex/ranking';
import { loreByCode } from '@/lib/game/equipment/lore';

import { InventoryGrid, type InvItem } from './InventoryGrid';

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ slot?: string }>;
}) {
  const userId = await getSessionUserId();
  if (!userId) return null;
  const { slot } = await searchParams;
  const initialSlot: Slot | 'all' =
    slot === 'weapon' || slot === 'armor' || slot === 'accessory' ? slot : 'all';

  // 콜드 DB 커넥션 hang 시 페이지 무한 대기 방지 — 실패 시 빈 결과로 degrade(2026-05-29).
  const _r = await withTimeout(
    Promise.all([
    db
      .select({
        id: userEquipment.id,
        catalogItemId: userEquipment.catalogItemId,
        code: catalogItems.code,
        name: catalogItems.name,
        slot: catalogItems.slot,
        enhanceLevel: userEquipment.enhanceLevel,
        transcendLevel: userEquipment.transcendLevel,
        transcendProgress: userEquipment.transcendProgress,
        equippedSlot: userEquipment.equippedSlot,
        acquiredAt: userEquipment.firstAcquiredAt,
      })
      .from(userEquipment)
      .innerJoin(catalogItems, eq(userEquipment.catalogItemId, catalogItems.id))
      .where(eq(userEquipment.userId, userId)),
    db
      .select({ instanceId: enhancementJobs.userEquipmentId })
      .from(enhancementJobs)
      .where(and(eq(enhancementJobs.userId, userId), eq(enhancementJobs.status, 'running'))),
    db
      .select({ nickname: profiles.nickname })
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1),
    liberatedItemRanks(userId),
    ]),
    3500,
    'inventory.page',
  ).catch(() => null);
  const rows = _r?.[0] ?? [];
  const runningJobs = _r?.[1] ?? [];
  const prof = _r?.[2] ?? [];
  const libRanks = _r?.[3] ?? new Map<number, number>();
  const nickname = prof[0]?.nickname ?? '플레이어';

  const busy = new Set(runningJobs.map((r) => r.instanceId.toString()));
  const items: InvItem[] = rows.map((r) => ({
    id: r.id.toString(),
    catalogItemId: r.catalogItemId,
    code: r.code,
    name: r.name,
    slot: r.slot,
    enhanceLevel: r.enhanceLevel,
    transcendLevel: r.transcendLevel,
    transcendProgress: r.transcendProgress,
    equipped: r.equippedSlot != null,
    acquiredAtMs: r.acquiredAt.getTime(),
    busy: busy.has(r.id.toString()),
    championRank: libRanks.get(r.catalogItemId) ?? null,
    lore: loreByCode(r.code),
  }));

  return (
    <div className="px-4 py-4">
      {items.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50/40 p-8 text-center text-sm dark:border-amber-800 dark:bg-amber-950/20">
          첫 장비가 없습니다. 보급 상자를 받아보세요.
        </div>
      ) : (
        <InventoryGrid items={items} initialSlot={initialSlot} nickname={nickname} />
      )}
    </div>
  );
}
