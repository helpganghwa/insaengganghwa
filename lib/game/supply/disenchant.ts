import 'server-only';

import { and, eq, inArray, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { profiles } from '@/lib/db/schema/profiles';
import { equipmentInstances } from '@/lib/db/schema/equipment';
import { enhancementJobs } from '@/lib/db/schema/enhance';
import { disenchantLogs } from '@/lib/db/schema/supply';
import { DIAMOND_PER_DISENCHANT } from '@/lib/game/balance';

/**
 * 분해 — GDD §3.4 / BALANCE §4.4 / SCHEMA §5.3. **고정 2다이아/개**(강화·초월 무관).
 * 미장착·미잠금·강화중 아님·강화 제물 예약 아님인 개체만. 부적격은 건너뜀(배치 비실패).
 * 개체 삭제 + 다이아 지급 + 로그 = 단일 트랜잭션. 단일 분해 = ids 길이 1.
 */
export type DisenchantResult = { disenchanted: number; diamondGranted: number };

export function disenchant(input: {
  userId: string;
  equipmentInstanceIds: bigint[];
}): Promise<DisenchantResult> {
  const { userId, equipmentInstanceIds } = input;
  if (equipmentInstanceIds.length === 0) {
    return Promise.resolve({ disenchanted: 0, diamondGranted: 0 });
  }

  return db.transaction(async (tx) => {
    const eligible = await tx
      .select({ id: equipmentInstances.id, catalogItemId: equipmentInstances.catalogItemId })
      .from(equipmentInstances)
      .where(
        and(
          eq(equipmentInstances.userId, userId),
          inArray(equipmentInstances.id, equipmentInstanceIds),
          eq(equipmentInstances.isLocked, false),
          sql`${equipmentInstances.equippedSlot} is null`,
          sql`not exists (select 1 from ${enhancementJobs} ej
              where ej.equipment_instance_id = ${equipmentInstances.id} and ej.status = 'running')`,
          sql`not exists (select 1 from ${enhancementJobs} ej
              where ej.fodder_instance_id = ${equipmentInstances.id} and ej.status = 'running')`,
        ),
      )
      .for('update');

    if (eligible.length === 0) return { disenchanted: 0, diamondGranted: 0 };

    const ids = eligible.map((e) => e.id);
    await tx.delete(equipmentInstances).where(inArray(equipmentInstances.id, ids));

    await tx.insert(disenchantLogs).values(
      eligible.map((e) => ({
        userId,
        catalogItemId: e.catalogItemId,
        equipmentInstanceId: e.id,
        diamondGranted: BigInt(DIAMOND_PER_DISENCHANT),
      })),
    );

    const total = eligible.length * DIAMOND_PER_DISENCHANT;
    await tx
      .update(profiles)
      .set({ diamond: sql`${profiles.diamond} + ${BigInt(total)}` })
      .where(eq(profiles.id, userId));

    return { disenchanted: eligible.length, diamondGranted: total };
  });
}
