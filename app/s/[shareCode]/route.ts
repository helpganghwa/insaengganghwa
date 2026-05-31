import { NextResponse, type NextRequest } from 'next/server';

/**
 * 짧은 공유 링크 — WIREFRAMES §10. /s/<nickname> → /u/<nickname> 공개 프로필.
 *
 * 가입 귀속(referral) wiring(2026-05-31):
 * - shareCode를 'pending_referral' 쿠키에 7일 저장(SameSite=Lax, Path=/).
 * - (game) layout 진입 시 processPendingReferral(userId)이 쿠키를 읽어
 *   referral_attributions row 생성 + referrer에 보상 지급 + 쿠키 삭제.
 * - 멱등: referral_attributions(new_user_id UNIQUE) — 두 번째 시도는 silent skip.
 */
const SEVEN_DAYS = 7 * 24 * 60 * 60;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shareCode: string }> },
) {
  const { shareCode } = await params;
  const res = NextResponse.redirect(new URL(`/u/${shareCode}`, req.nextUrl.origin), 307);
  res.cookies.set('pending_referral', shareCode, {
    path: '/',
    maxAge: SEVEN_DAYS,
    sameSite: 'lax',
    httpOnly: false,
  });
  return res;
}
