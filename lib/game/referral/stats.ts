import 'server-only';

import { eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { referralAttributions } from '@/lib/db/schema/social';

/**
 * 초대 보상 정책 — 사용자 결정.
 * 내 공유 링크로 가입한 1명당:
 *   - 💎 500
 *   - 📦 총 15개(무기·방어구·장신구 각 5개) — 분배는 redeem.ts payload 참조.
 */
export const INVITE_DIAMOND_PER_REFERRAL = 500;
export const INVITE_BOX_PER_REFERRAL = 15; // 종류별 5개씩 × 3종 = 15

export type ReferralStats = {
  totalReferrals: number;
  totalDiamondEarned: number;
  totalBoxEarned: number;
};

/** 본인이 추천(공유 링크 가입 귀속)한 누적 가입자 수 → 보상 환산. */
export async function getReferralStats(userId: string): Promise<ReferralStats> {
  const [row] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(referralAttributions)
    .where(eq(referralAttributions.referrerUserId, userId));
  const n = Number(row?.c ?? 0);
  return {
    totalReferrals: n,
    totalDiamondEarned: n * INVITE_DIAMOND_PER_REFERRAL,
    totalBoxEarned: n * INVITE_BOX_PER_REFERRAL,
  };
}
