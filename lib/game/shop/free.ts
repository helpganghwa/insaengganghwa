import 'server-only';

import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { profiles } from '@/lib/db/schema/profiles';
import { userSupplyBoxes } from '@/lib/db/schema/supply';
import { shopFreeClaims } from '@/lib/db/schema/shop';
import { SUPPLY_SLOTS, type SupplySlot } from '@/lib/game/balance';
import { periodKey as resetKey } from './period';

/**
 * 상점 무료 수령 — 슬롯별 주기(KST) 멱등. 결제 불필요.
 *  - daily(매일) / weekly(매주, 월요일 시작) / monthly(매월) / signup(가입 1회)
 * 보상 수치는 시작값(경제 시뮬 후 조정). 무료 = 상점 방문 유인용 소형 보상.
 */
export type FreeSlot = 'daily' | 'weekly' | 'monthly' | 'signup';
export const FREE_SLOTS: FreeSlot[] = ['daily', 'weekly', 'monthly', 'signup'];

export const FREE_REWARDS: Record<FreeSlot, { diamond: number; boxes: number }> = {
  daily: { diamond: 0, boxes: 1 },
  weekly: { diamond: 200, boxes: 0 },
  monthly: { diamond: 500, boxes: 0 },
  signup: { diamond: 0, boxes: 10 },
};

/** 현재 주기 키(KST). 같은 키 = 이미 받은 주기. signup=once, 그 외는 공용 주기키. */
function periodKey(slot: FreeSlot): string {
  if (slot === 'signup') return 'once';
  return resetKey(slot); // daily/weekly/monthly (주간=월요일·월간=1일)
}

export class ShopFreeError extends Error {
  constructor(public code: 'ALREADY_CLAIMED') {
    super(code);
    this.name = 'ShopFreeError';
  }
}

/** 각 슬롯이 지금 수령 가능한지(빨간점 표시용). */
export async function getFreeStatus(userId: string): Promise<Record<FreeSlot, boolean>> {
  const rows = await db
    .select({ slot: shopFreeClaims.slot, periodKey: shopFreeClaims.periodKey })
    .from(shopFreeClaims)
    .where(eq(shopFreeClaims.userId, userId));
  const claimed = new Map(rows.map((r) => [r.slot, r.periodKey]));
  const out = {} as Record<FreeSlot, boolean>;
  for (const s of FREE_SLOTS) out[s] = claimed.get(s) !== periodKey(s);
  return out;
}

function splitBoxes(n: number): Record<SupplySlot, number> {
  const base = Math.floor(n / SUPPLY_SLOTS.length);
  const out = { weapon: base, armor: base, accessory: base } as Record<SupplySlot, number>;
  let rem = n - base * SUPPLY_SLOTS.length;
  for (let i = 0; rem > 0; i++, rem--) out[SUPPLY_SLOTS[i % SUPPLY_SLOTS.length]!] += 1;
  return out;
}

/** 무료 수령 — 주기 멱등(row 잠금 후 주기 비교). 통과 시 보상 지급 + 주기 기록. */
export function claimFree(userId: string, slot: FreeSlot): Promise<{ diamond: number; boxes: number }> {
  const cur = periodKey(slot);
  const reward = FREE_REWARDS[slot];
  return db.transaction(async (tx) => {
    // 1) row 보장(없으면 빈 키로 생성) → 2) FOR UPDATE 잠금 → 3) 주기 비교.
    await tx
      .insert(shopFreeClaims)
      .values({ userId, slot, periodKey: '' })
      .onConflictDoNothing();
    const [row] = await tx
      .select({ periodKey: shopFreeClaims.periodKey })
      .from(shopFreeClaims)
      .where(and(eq(shopFreeClaims.userId, userId), eq(shopFreeClaims.slot, slot)))
      .for('update');
    if (row?.periodKey === cur) throw new ShopFreeError('ALREADY_CLAIMED');

    if (reward.diamond > 0) {
      await tx
        .update(profiles)
        .set({ diamond: sql`${profiles.diamond} + ${BigInt(reward.diamond)}` })
        .where(eq(profiles.id, userId));
    }
    if (reward.boxes > 0) {
      const dist = splitBoxes(reward.boxes);
      for (const s of SUPPLY_SLOTS) {
        const n = dist[s];
        if (n > 0) {
          await tx
            .insert(userSupplyBoxes)
            .values({ userId, slot: s, count: BigInt(n) })
            .onConflictDoUpdate({
              target: [userSupplyBoxes.userId, userSupplyBoxes.slot],
              set: { count: sql`${userSupplyBoxes.count} + ${BigInt(n)}` },
            });
        }
      }
    }
    await tx
      .update(shopFreeClaims)
      .set({ periodKey: cur, updatedAt: new Date() })
      .where(and(eq(shopFreeClaims.userId, userId), eq(shopFreeClaims.slot, slot)));

    return { diamond: reward.diamond, boxes: reward.boxes };
  });
}
