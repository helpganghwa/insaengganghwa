import 'server-only';

import { eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { referralAttributions } from '@/lib/db/schema/social';

/**
 * 초대 보상 정책 — 사용자 결정(2026-05-31).
 * 내 공유 링크로 가입한 1명당:
 *   - 💎 300
 *   - 📦 종류별 1개씩(무기·방어구·장신구) = 총 3개
 *
 * 가입 귀속(referral_attributions) wiring은 후속 PR에서 — 현재는 표시용 통계만.
 */
export const INVITE_DIAMOND_PER_REFERRAL = 300;
export const INVITE_BOX_PER_REFERRAL = 3; // 종류별 1개씩 × 3종

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
