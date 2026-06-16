import 'server-only';

import { eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { referralAttributions } from '@/lib/db/schema/social';
import { attributeReferralFromShare, ReferralError } from './redeem';

/** 카카오 공유 링크 가입 귀속용 쿠키명 — `/s/[shareCode]` route handler가 7일 TTL로 설정. */
export const PENDING_REFERRAL_COOKIE = 'pending_referral';
/** 링크 클릭 시각(epoch ms) 쿠키 — 신규 가입 판정용(클릭 이후 생성된 계정만 귀속). */
export const PENDING_REFERRAL_AT_COOKIE = 'pending_referral_at';

/**
 * (game) 레이아웃 진입 시 호출 — 공유 링크 **가입 전환** 귀속(멱등).
 *
 * 보상 조건 = "공유 링크 클릭 → 그 이후 회원가입 완료". clickedAtMs(클릭 시각 쿠키)보다
 * 늦게 생성된 계정만 귀속한다(기존 유저가 링크를 타도 보상 없음) — 판정은 redeem.ts.
 *
 * shareCode/clickedAtMs는 **호출자가 요청 스코프에서 쿠키를 읽어** 전달한다. `cookies()`를
 * `after()` 안에서 호출하면 Next가 throw(동적 쿠키 API는 요청 스코프 한정)하므로, 여기서는
 * cookies()를 일절 쓰지 않고 DB 귀속만 수행 → after()에서 안전하게 응답 후 보장 실행.
 *
 * 멱등: referral_attributions.new_user_id UNIQUE + 사전 existing 체크. 쿠키 삭제는 RSC/after에서
 * 불가하나 7일 TTL + 멱등이라 재방문 시 existing 체크가 싼 no-op으로 끝난다.
 */
export async function processPendingReferral(
  userId: string,
  shareCode: string,
  clickedAtMs?: number,
): Promise<void> {
  if (!shareCode) return;
  try {
    // 이미 귀속된 유저는 skip(UNIQUE 위반 전에 빠르게 차단).
    const [existing] = await db
      .select({ id: referralAttributions.id })
      .from(referralAttributions)
      .where(eq(referralAttributions.newUserId, userId))
      .limit(1);
    if (existing) return;

    await attributeReferralFromShare(userId, shareCode, clickedAtMs);
  } catch (e) {
    // ReferralError(SELF_REFERRAL/ALREADY_REDEEMED 등)는 정상 흐름 — 조용히. 그 외만 기록.
    if (!(e instanceof ReferralError)) console.error('[processPendingReferral]', e);
  }
}
