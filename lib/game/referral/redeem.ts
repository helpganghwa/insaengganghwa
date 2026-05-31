import 'server-only';

import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { profiles } from '@/lib/db/schema/profiles';
import { userSupplyBoxes } from '@/lib/db/schema/supply';
import { referralAttributions } from '@/lib/db/schema/social';
import { SUPPLY_SLOTS } from '@/lib/game/balance';
import { INVITE_DIAMOND_PER_REFERRAL } from './stats';

export class ReferralError extends Error {
  constructor(
    public code:
      | 'INVALID_CODE'
      | 'SELF_REFERRAL'
      | 'ALREADY_REDEEMED'
      | 'PROFILE_NOT_FOUND',
  ) {
    super(code);
    this.name = 'ReferralError';
  }
}

/**
 * 카카오 공유 링크 → 가입 귀속 + 추천인(referrer) 보상 지급.
 *
 * - shareCode = referrer nickname (현재 /s/[shareCode] → /u/<nickname> 패턴).
 * - referrer 보상: 다이아 +300 + 보급상자 종류별 +1(무기·방어구·장신구 각 1).
 * - 멱등: referral_attributions(new_user_id UNIQUE) — 두 번째 호출은
 *   ALREADY_REDEEMED throw. unique violation 시 rewarded는 이전에 처리된 상태.
 * - 단일 트랜잭션(attribute row 생성 + diamond 가산 + 상자 가산 + rewarded=true).
 */
export async function attributeReferralFromShare(
  newUserId: string,
  shareCode: string,
): Promise<{ referrerNickname: string } | null> {
  return db.transaction(async (tx) => {
    // 1. shareCode (=nickname) → referrer 식별.
    const [referrer] = await tx
      .select({ id: profiles.id, nickname: profiles.nickname })
      .from(profiles)
      .where(eq(profiles.nickname, shareCode))
      .limit(1);
    if (!referrer) return null; // 존재하지 않는 nickname → silent skip(잘못된 링크).

    if (referrer.id === newUserId) {
      throw new ReferralError('SELF_REFERRAL');
    }

    // 2. attribution row 생성 — new_user_id UNIQUE 위반 시 이미 귀속된 사용자.
    try {
      await tx.insert(referralAttributions).values({
        referrerUserId: referrer.id,
        newUserId,
        shareCode,
        rewarded: false,
      });
    } catch {
      throw new ReferralError('ALREADY_REDEEMED');
    }

    // 3. referrer 다이아 +INVITE_DIAMOND_PER_REFERRAL.
    await tx
      .update(profiles)
      .set({
        diamond: sql`${profiles.diamond} + ${BigInt(INVITE_DIAMOND_PER_REFERRAL)}`,
      })
      .where(eq(profiles.id, referrer.id));

    // 4. referrer 보급상자 종류별 +1.
    for (const slot of SUPPLY_SLOTS) {
      await tx
        .insert(userSupplyBoxes)
        .values({ userId: referrer.id, slot, count: 1n })
        .onConflictDoUpdate({
          target: [userSupplyBoxes.userId, userSupplyBoxes.slot],
          set: { count: sql`${userSupplyBoxes.count} + 1` },
        });
    }

    // 5. rewarded 표시(멱등 보강).
    await tx
      .update(referralAttributions)
      .set({ rewarded: true })
      .where(
        and(
          eq(referralAttributions.referrerUserId, referrer.id),
          eq(referralAttributions.newUserId, newUserId),
        ),
      );

    return { referrerNickname: referrer.nickname };
  });
}
