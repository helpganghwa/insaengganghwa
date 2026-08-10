import 'server-only';

import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { userSupplyBoxes } from '@/lib/db/schema/supply';
import { SUPPLY_SLOTS } from '@/lib/game/balance';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * 보급 상자 n개 회수 — **슬롯 합계** 기준(환불 tx 전용).
 *
 * 환불 사전판정(payment/refund.ts previewClawback)이 슬롯 합계로 충분 여부를 보므로 회수도 같은
 * 기준이어야 한다. 불변식: `sufficient === true`면 회수는 반드시 전량 이루어진다. 지급 때의
 * 슬롯 분배로 역차감하면(유저가 한 슬롯만 몰아 연 경우) 합계는 충분한데 그 슬롯에서만 조용히
 * 회수가 줄어, 현금은 전액 환불되고 상자는 남는 상태가 된다(clawback_done=true로 기록되어 탐지도 안 됨).
 *
 * 차감량은 슬롯 보유량 이하로 코드가 보장하므로 SQL에 0 클램프를 두지 않는다 — 클램프가 있으면
 * 다시 조용한 손실 경로가 생긴다. 보유 합계가 total보다 적으면 있는 만큼만 회수하고 그 값을 반환한다.
 */
export async function reclaimBoxesTotal(
  tx: Tx,
  userId: string,
  serverId: number,
  total: number,
): Promise<number> {
  if (total <= 0) return 0;

  // 회수 대상 슬롯 전체를 한 번에 잠근다 — 읽은 보유량과 차감 사이에 소비(open)가 끼면
  // 클램프 없는 차감이 음수를 만든다.
  const rows = await tx
    .select({ slot: userSupplyBoxes.slot, count: userSupplyBoxes.count })
    .from(userSupplyBoxes)
    .where(and(eq(userSupplyBoxes.userId, userId), eq(userSupplyBoxes.serverId, serverId)))
    .for('update');
  const held = new Map(rows.map((r) => [r.slot as string, Number(r.count)]));

  let remaining = total;
  let reclaimed = 0;
  for (const slot of SUPPLY_SLOTS) {
    if (remaining <= 0) break;
    const have = held.get(slot) ?? 0;
    if (have <= 0) continue;
    const take = Math.min(have, remaining);
    await tx
      .update(userSupplyBoxes)
      .set({ count: sql`${userSupplyBoxes.count} - ${BigInt(take)}` })
      .where(
        and(
          eq(userSupplyBoxes.userId, userId),
          eq(userSupplyBoxes.serverId, serverId),
          eq(userSupplyBoxes.slot, slot),
        ),
      );
    remaining -= take;
    reclaimed += take;
  }
  return reclaimed;
}
