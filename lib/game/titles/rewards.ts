import 'server-only';

import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { userSupplyBoxes } from '@/lib/db/schema/supply';
import {
  SUPPLY_SLOTS,
  TITLE_DISCOVERY_DIAMOND,
  titleMilestoneBoxes,
  titleMilestonesReached,
  titleNextMilestone,
  type SupplySlot,
} from '@/lib/game/balance';
import { walletAdd } from '@/lib/game/wallet';

/**
 * 칭호 발견 보상(0191, BALANCE §12) — 자동 지급이 아니라 칭호 화면에서 [모두 받기]로 수령.
 *  - 발견 보상: user_titles.reward_claimed_at IS NULL 행 전부 → now()로 바꾸며 그 수 × 💎20.
 *  - 달성 보상: 발견 총수가 50·100·…에 닿았고 title_milestone_claims에 없으면 그 개수만큼 상자.
 *  한 트랜잭션·멱등(재호출은 0). 기존 보유분도 미수령이라 첫 수령이 곧 소급이다(우편 없음).
 */
export type TitleRewardSummary = {
  /** 미수령 발견 보상 개수(× TITLE_DISCOVERY_DIAMOND). */
  unclaimedTitles: number;
  discovered: number;
  /** 도달했지만 아직 안 받은 달성 단계(각각 그 개수만큼 상자). */
  claimableMilestones: number[];
  nextMilestone: number;
};

export type TitleRewardClaim = {
  titles: number;
  diamond: number;
  boxes: Record<SupplySlot, number>;
  milestones: number[];
};

/** 상자 n개를 3부위로 — 3의 배수가 아니면 나머지를 무기→방어구 순으로 하나씩 얹는다(17/17/16). */
export function splitBoxesUneven(n: number): Record<SupplySlot, number> {
  const base = Math.floor(n / 3);
  const r = n - base * 3;
  return { weapon: base + (r >= 1 ? 1 : 0), armor: base + (r >= 2 ? 1 : 0), accessory: base };
}

/** 원장 행 + 수령 기록으로 요약(칭호 페이지·/me 배지 공용, 순수). */
export function summarizeTitleRewards(
  ledger: { reward_claimed_at: Date | string | null }[],
  claimedMilestones: Iterable<number>,
): TitleRewardSummary {
  const discovered = ledger.length;
  const unclaimedTitles = ledger.filter((l) => l.reward_claimed_at == null).length;
  const claimed = new Set(claimedMilestones);
  return {
    unclaimedTitles,
    discovered,
    claimableMilestones: titleMilestonesReached(discovered).filter((m) => !claimed.has(m)),
    nextMilestone: titleNextMilestone(discovered),
  };
}

export async function getClaimedTitleMilestones(userId: string, serverId: number): Promise<number[]> {
  const rows = (await db.execute(sql`
    select count from title_milestone_claims where user_id=${userId}::uuid and server_id=${serverId}
  `)) as unknown as { count: number }[];
  return rows.map((r) => Number(r.count));
}

export async function claimTitleRewards(userId: string, serverId: number): Promise<TitleRewardClaim> {
  return db.transaction(async (tx) => {
    // 발견 보상 — 미수령 행을 잠그며 수령 처리(UPDATE … RETURNING이 곧 락). 재호출은 0행.
    const claimed = (await tx.execute(sql`
      update user_titles set reward_claimed_at = now()
      where user_id=${userId}::uuid and server_id=${serverId} and reward_claimed_at is null
      returning title_code
    `)) as unknown as { title_code: string }[];
    const titles = claimed.length;
    const diamond = titles * TITLE_DISCOVERY_DIAMOND;
    if (diamond > 0) await walletAdd(tx, userId, serverId, diamond, 'title_discovery');

    // 달성 보상 — 발견 총수 기준(수령 여부 무관). PK 충돌 = 이미 받음.
    const [{ c }] = (await tx.execute(sql`
      select count(*)::int as c from user_titles where user_id=${userId}::uuid and server_id=${serverId}
    `)) as unknown as { c: number }[];
    const boxes: Record<SupplySlot, number> = { weapon: 0, armor: 0, accessory: 0 };
    const milestones: number[] = [];
    for (const m of titleMilestonesReached(Number(c))) {
      const ins = (await tx.execute(sql`
        insert into title_milestone_claims (user_id, server_id, count) values (${userId}::uuid, ${serverId}, ${m})
        on conflict do nothing returning count
      `)) as unknown as { count: number }[];
      if (ins.length === 0) continue;
      milestones.push(m);
      const split = splitBoxesUneven(titleMilestoneBoxes(m));
      for (const slot of SUPPLY_SLOTS) {
        const n = split[slot];
        if (n <= 0) continue;
        await tx
          .insert(userSupplyBoxes)
          .values({ userId, serverId, slot, count: BigInt(n) })
          .onConflictDoUpdate({
            target: [userSupplyBoxes.userId, userSupplyBoxes.serverId, userSupplyBoxes.slot],
            set: { count: sql`${userSupplyBoxes.count} + ${BigInt(n)}` },
          });
        boxes[slot] += n;
      }
    }
    return { titles, diamond, boxes, milestones };
  });
}
