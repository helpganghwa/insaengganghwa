import 'server-only';

import { eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { zones } from '@/lib/db/schema/guild';

import {
  TAX_POINTS_PER_DIAMOND,
  taxPointsForEnhanceSuccess,
  GUILD_ZONE_TAX_BONUS,
  GUILD_FULL_REGION_TAX_BONUS,
} from './balance';
import { ensureResidence } from './residence';

/**
 * 거주 구역 세금 누적 — GUILD §5.5. 강화 성공 시 호출(도달 레벨 = 포인트).
 * 100pt마다 구역 💎 +1(잔여 carry). **강화 핵심 트랜잭션과 분리(best-effort)** —
 * 실패해도 강화 성공엔 영향 없음(세금 1회 손실은 허용). 거주 미배정이면 랜덤 배정.
 */
export async function accrueResidenceTax(userId: string, serverId: number, reachedLevel: number): Promise<void> {
  const pts = taxPointsForEnhanceSuccess(reachedLevel);
  if (pts <= 0) return;
  await db.transaction(async (tx) => {
    const zoneId = await ensureResidence(tx, userId, serverId);
    if (!zoneId) return;
    // 독점 세금 보너스(B안) — 구역에 미리 저장된 tax_bonus 배율만 곱한다(고빈도 훅이라 계산 없이 읽기만).
    // 배율은 소유 변동 시점에만 recalcTaxBonus로 재계산(하루 1회 점령전 + 해산 등). 중립 구역은 1.
    const effPts = sql`round(${pts}::numeric * ${zones.taxBonus})::bigint`;
    // tax_points += effPts → 100당 tax_diamond +1, 잔여 carry. (bigint / int = 정수 나눗셈)
    await tx
      .update(zones)
      .set({
        taxDiamond: sql`${zones.taxDiamond} + (${zones.taxPoints} + ${effPts}) / ${TAX_POINTS_PER_DIAMOND}`,
        taxPoints: sql`(${zones.taxPoints} + ${effPts}) % ${TAX_POINTS_PER_DIAMOND}`,
      })
      .where(eq(zones.id, zoneId));
  });
}

/**
 * 독점 세금 보너스(B안) 재계산 — 소유가 바뀔 때만 호출(하루 1회 점령전 정산·중립화, 해산 등).
 * 각 구역 zones.tax_bonus = 소유 길드의 (소유 구역 수 ×1%) + (완전장악 권역 수 ×25%) + 1. 중립=1.
 * 강화 세금 누적(accrueResidenceTax)은 이 값을 읽기만 하므로 고빈도 경로에 계산 부하가 없다.
 */
type TaxExecutor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];
export async function recalcTaxBonus(serverId: number, executor: TaxExecutor = db): Promise<void> {
  await executor.execute(sql`
    update zones z set tax_bonus = (case when z.owner_guild_id is null then 1 else
      1 + (select count(*) from zones z2 where z2.server_id = z.server_id and z2.owner_guild_id = z.owner_guild_id)::numeric * ${GUILD_ZONE_TAX_BONUS}
        + (select count(*) from (
             select 1 from zones z3 where z3.server_id = z.server_id
             group by z3.region having count(*) = count(*) filter (where z3.owner_guild_id = z.owner_guild_id)
           ) t)::numeric * ${GUILD_FULL_REGION_TAX_BONUS}
      end)
    where z.server_id = ${serverId}
  `);
}
