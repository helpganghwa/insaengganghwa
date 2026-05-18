import { NextResponse, type NextRequest } from 'next/server';

/**
 * 짧은 공유 링크 — WIREFRAMES §10. /s/<nickname> → /u/<nickname> 공개 프로필.
 * (가입 전환 추적/공유자 리워드 적립은 후속: referral 스키마 필요. 현재는 무상태 리다이렉트.)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shareCode: string }> },
) {
  const { shareCode } = await params;
  return NextResponse.redirect(new URL(`/u/${shareCode}`, req.nextUrl.origin), 307);
}
