import { NextResponse, type NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { raids } from '@/lib/db/schema/raid';

/**
 * 짧은 공유 링크 — WIREFRAMES §10.
 *
 * 분기(2026-06-01):
 *  1) 영숫자 10자(base36) + raids.share_code 매칭 → /raid/<raidId> 리다이렉트
 *     (레이드 초대 — 카카오 공유 wiring 결과).
 *  2) 그 외 → /u/<code|nickname> 공개 프로필 + pending_referral 쿠키.
 *     (불변 공개 코드 8자 또는 레거시 닉네임 — /u·referral 리졸루션이 둘 다 허용.)
 *
 * 가입 귀속(referral, 2026-05-31):
 *  - shareCode를 'pending_referral' 쿠키에 7일 저장(SameSite=Lax, Path=/).
 *  - (game) layout 진입 시 processPendingReferral(userId)이 쿠키를 읽어
 *    referral_attributions row 생성 + referrer에 보상 지급 + 쿠키 삭제.
 *  - 멱등: referral_attributions(new_user_id UNIQUE) — 두 번째 시도는 silent skip.
 */
const SEVEN_DAYS = 7 * 24 * 60 * 60;
const RAID_SHARE_RE = /^[a-z0-9]{10}$/;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shareCode: string }> },
) {
  const { shareCode } = await params;

  // 1) 레이드 shareCode 우선 매칭 — 영숫자 10자 + DB 조회. 못 찾으면 닉네임 분기로.
  //    공개 풀페이지 초대 랜딩(/raid-invite/<shareCode>)으로 — 헤더/네비 없는 전체 화면.
  //    비로그인도 보스·남은시간 보고 로그인 후 참여 가능(랜딩에서 분기).
  if (RAID_SHARE_RE.test(shareCode)) {
    try {
      const [r] = await db
        .select({ id: raids.id })
        .from(raids)
        .where(eq(raids.shareCode, shareCode))
        .limit(1);
      if (r) {
        return NextResponse.redirect(
          new URL(`/raid-invite/${shareCode}`, req.nextUrl.origin),
          307,
        );
      }
    } catch (e) {
      console.warn('[s/route.raid-lookup]', (e as Error).message);
    }
  }

  // 2) 닉네임 분기 — referral 쿠키 세팅 후 리다이렉트.
  //    ?start=1('인생강화 시작' 버튼) → 앱 시작(/), 그 외(카드 클릭) → 공개 프로필(/u/[code]).
  //    두 경우 모두 쿠키를 세팅하므로 가입 시 추천 귀속됨.
  const start = req.nextUrl.searchParams.get('start') === '1';
  const target = start ? '/' : `/u/${shareCode}`;
  const res = NextResponse.redirect(new URL(target, req.nextUrl.origin), 307);
  res.cookies.set('pending_referral', shareCode, {
    path: '/',
    maxAge: SEVEN_DAYS,
    sameSite: 'lax',
    httpOnly: false,
  });
  return res;
}
