import 'server-only';

import { eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { zones } from '@/lib/db/schema/guild';

import {
  TAX_POINTS_PER_DIAMOND,
  TAX_MELEE_PRIZE_RATE,
  taxPointsForEnhanceSuccess,
  taxPointsForSpend,
  GUILD_ZONE_TAX_BONUS,
  GUILD_FULL_REGION_TAX_BONUS,
} from './balance';
import { ensureResidence } from './residence';

type TaxExecutor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * 구역 포인트 가산(세 원천 공통) — 독점 세금 보너스(B안)는 구역에 미리 저장된 tax_bonus 배율만 곱한다
 * (고빈도 훅이라 계산 없이 읽기만). 배율은 소유 변동 시점에만 recalcTaxBonus로 재계산. 중립 구역은 1.
 * tax_points += effPts → 100당 tax_diamond +1, 잔여 carry. (bigint / int = 정수 나눗셈)
 */
async function addZoneTaxPoints(dbx: TaxExecutor, zoneId: number, pts: number): Promise<void> {
  const effPts = sql`round(${pts}::numeric * ${zones.taxBonus})::bigint`;
  await dbx
    .update(zones)
    .set({
      taxDiamond: sql`${zones.taxDiamond} + (${zones.taxPoints} + ${effPts}) / ${TAX_POINTS_PER_DIAMOND}`,
      taxPoints: sql`(${zones.taxPoints} + ${effPts}) % ${TAX_POINTS_PER_DIAMOND}`,
    })
    .where(eq(zones.id, zoneId));
}

/**
 * 거주 구역 세금 누적 ① 강화 성공 — GUILD §5.5. 도달 레벨 = 포인트.
 * **강화 핵심 트랜잭션과 분리(best-effort)** — 실패해도 강화 성공엔 영향 없음(세금 1회 손실은 허용).
 * 거주 미배정이면 랜덤 배정.
 */
export async function accrueResidenceTax(userId: string, serverId: number, reachedLevel: number): Promise<void> {
  const pts = taxPointsForEnhanceSuccess(reachedLevel);
  if (pts <= 0) return;
  await db.transaction(async (tx) => {
    const zoneId = await ensureResidence(tx, userId, serverId);
    if (!zoneId) return;
    await addZoneTaxPoints(tx, zoneId, pts);
  });
}

/**
 * 거주 구역 세금 누적 ② 다이아 지출 — 지출 1💎 = 1pt(지출의 1%). walletTrySpend가 차감 성공 직후
 * **같은 dbx(호출자 트랜잭션)** 로 호출 — 차감이 롤백되면 세금도 함께 사라진다. 사유 무관(지갑 차감 전부).
 */
export async function accrueSpendTax(
  dbx: TaxExecutor,
  userId: string,
  serverId: number,
  diamondsSpent: bigint | number,
): Promise<void> {
  const pts = taxPointsForSpend(Number(diamondsSpent));
  if (pts <= 0) return;
  const zoneId = await ensureResidence(dbx, userId, serverId);
  if (!zoneId) return;
  await addZoneTaxPoints(dbx, zoneId, pts);
}

/**
 * 거주 구역 세금 누적 ③ 대난투 상금 — 결과 발표(reveal) 직후 배틀 1건의 참가자 전원을 한 SQL로 적립.
 * 참가자 상금(reward_diamond, 보너스 합산 후)의 TAX_MELEE_PRIZE_RATE 만큼을 그 참가자의 거주 구역에.
 * 유저가 받는 상금은 줄지 않는다(별도 적립). 거주 미배정 참가자는 건너뜀(첫 강화·지출 때 배정된다).
 * reveal은 조건부 전이로 정확히 1회라 중복 적립이 없다. 실패는 호출부에서 흡수(발표를 막지 않는다).
 */
export async function accrueMeleePrizeTax(
  serverId: number,
  battleId: bigint,
  executor: TaxExecutor = db,
): Promise<void> {
  await executor.execute(sql`
    with pr as (
      select c.residence_zone_id as zone_id,
             sum(round(mp.reward_diamond::numeric * ${TAX_MELEE_PRIZE_RATE} * ${TAX_POINTS_PER_DIAMOND} * z.tax_bonus))::bigint as pts
      from melee_participants mp
      join characters c on c.user_id = mp.user_id and c.server_id = ${serverId}
      join zones z on z.id = c.residence_zone_id
      where mp.battle_id = ${battleId} and mp.reward_diamond > 0 and c.residence_zone_id is not null
      group by c.residence_zone_id
    )
    update zones z
       set tax_diamond = z.tax_diamond + (z.tax_points + pr.pts) / ${TAX_POINTS_PER_DIAMOND},
           tax_points = (z.tax_points + pr.pts) % ${TAX_POINTS_PER_DIAMOND}
      from pr
     where z.id = pr.zone_id
  `);
}

/**
 * 독점 세금 보너스(B안) 재계산 — 소유가 바뀔 때만 호출(하루 1회 점령전 정산·중립화, 해산 등).
 * 각 구역 zones.tax_bonus = 소유 길드의 (미방치 소유 구역 수 ×1%) + (완전장악 권역 수 ×25%) + 1. 중립=1.
 * 강화 세금 누적(accrueResidenceTax)은 이 값을 읽기만 하므로 고빈도 경로에 계산 부하가 없다.
 */
export async function recalcTaxBonus(serverId: number, executor: TaxExecutor = db): Promise<void> {
  await executor.execute(sql`
    -- 방치 구역(abandoned_day, 0180)은 **계산식에서만** 빠진다(2026-09-01): 구역 수(+1%/구역)·완전장악
    -- 집계에서 제외하되, 산출된 길드 세율은 방치 구역 자체에도 그대로 적용(소유 구역 전체 동일 배율).
    update zones z set tax_bonus = (case when z.owner_guild_id is null then 1 else
      1 + (select count(*) from zones z2 where z2.server_id = z.server_id and z2.owner_guild_id = z.owner_guild_id and z2.abandoned_day is null)::numeric * ${GUILD_ZONE_TAX_BONUS}
        + (select count(*) from (
             select 1 from zones z3 where z3.server_id = z.server_id
             group by z3.region having count(*) = count(*) filter (where z3.owner_guild_id = z.owner_guild_id and z3.abandoned_day is null)
           ) t)::numeric * ${GUILD_FULL_REGION_TAX_BONUS}
      end)
    where z.server_id = ${serverId}
  `);
}
