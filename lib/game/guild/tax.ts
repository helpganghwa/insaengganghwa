import 'server-only';

import { eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { zones } from '@/lib/db/schema/guild';

import { TAX_POINTS_PER_DIAMOND, taxPointsForEnhanceSuccess } from './balance';
import { ensureResidence } from './residence';

/**
 * 거주 구역 세금 누적 — GUILD §5.5. 강화 성공 시 호출(도달 레벨 = 포인트).
 * 100pt마다 구역 💎 +1(잔여 carry). **강화 핵심 트랜잭션과 분리(best-effort)** —
 * 실패해도 강화 성공엔 영향 없음(세금 1회 손실은 허용). 거주 미배정이면 랜덤 배정.
 */
export async function accrueResidenceTax(userId: string, reachedLevel: number): Promise<void> {
  const pts = taxPointsForEnhanceSuccess(reachedLevel);
  if (pts <= 0) return;
  await db.transaction(async (tx) => {
    const zoneId = await ensureResidence(tx, userId);
    if (!zoneId) return;
    // tax_points += pts → 100당 tax_diamond +1, 잔여 carry. (bigint / int = 정수 나눗셈)
    await tx
      .update(zones)
      .set({
        taxDiamond: sql`${zones.taxDiamond} + (${zones.taxPoints} + ${pts}) / ${TAX_POINTS_PER_DIAMOND}`,
        taxPoints: sql`(${zones.taxPoints} + ${pts}) % ${TAX_POINTS_PER_DIAMOND}`,
      })
      .where(eq(zones.id, zoneId));
  });
}
