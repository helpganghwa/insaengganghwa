import { NextResponse, type NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { raids } from '@/lib/db/schema/raid';
import { PENDING_REFERRAL_COOKIE, PENDING_REFERRAL_AT_COOKIE } from '@/lib/game/referral/auto-attribute';

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
        .select({ id: raids.id, serverId: raids.serverId })
        .from(raids)
        .where(eq(raids.shareCode, shareCode))
        .limit(1);
      if (r) {
        const res = NextResponse.redirect(
          new URL(`/raid-invite/${shareCode}`, req.nextUrl.origin),
          307,
        );
        // 공유된 서버를 로그인 기본 선택으로(SERVER.md §3 — 초대받은 서버에서 시작).
        res.cookies.set('pending_server', String(r.serverId), {
          sameSite: 'lax',
          path: '/',
          maxAge: SEVEN_DAYS,
        });
        return res;
      }
    } catch (e) {
      console.warn('[s/route.raid-lookup]', (e as Error).message);
    }
  }

  // 2) 닉네임 분기 — 세 경우:
  //    (A) ?start=1('인생강화 시작' 진입) → **/go로 인앱브라우저 탈출**. 여기선 쿠키를 세팅하지
  //        않는다 — 인앱에서 세팅해도 외부 브라우저(탈출 후)로 안 넘어가 추천이 유실되기 때문.
  //        탈출 후 외부 브라우저가 /s?go=1을 다시 때려 거기서 쿠키를 세팅한다(추천 보존 핵심).
  //    (B) ?go=1(탈출 완료·외부 브라우저 또는 일반 브라우저가 /go에서 자동 이동) → 쿠키 세팅 + /login.
  //    (C) 그 외(카드 클릭) → 쿠키 세팅 + 공개 프로필(/u/[code]).
  const sParam = req.nextUrl.searchParams.get('s');
  const sQuery = sParam && /^\d+$/.test(sParam) ? `&s=${sParam}` : '';

  // (A) start=1 → 쿠키 없이 /go?next=/s/[code]?go=1 로. 탈출/자동이동 후 (B)가 쿠키를 세팅.
  if (req.nextUrl.searchParams.get('start') === '1') {
    const next = `/s/${encodeURIComponent(shareCode)}?go=1${sQuery}`;
    return NextResponse.redirect(
      new URL(`/go?next=${encodeURIComponent(next)}`, req.nextUrl.origin),
      307,
    );
  }

  // (B)/(C) — 쿠키 세팅 후 이동. go=1이면 로그인, 아니면 공개 프로필.
  const go = req.nextUrl.searchParams.get('go') === '1';
  const sfx = sParam && /^\d+$/.test(sParam) ? `?s=${sParam}` : '';
  const target = go ? '/login' : `/u/${shareCode}${sfx}`;
  const res = NextResponse.redirect(new URL(target, req.nextUrl.origin), 307);
  if (sParam && /^\d+$/.test(sParam)) {
    // 공유된 서버를 로그인 기본 선택으로.
    res.cookies.set('pending_server', sParam, { sameSite: 'lax', path: '/', maxAge: SEVEN_DAYS });
  }
  res.cookies.set(PENDING_REFERRAL_COOKIE, shareCode, {
    path: '/',
    maxAge: SEVEN_DAYS,
    sameSite: 'lax',
    httpOnly: false,
  });
  // 클릭 시각 — 신규 가입 판정용(이 시각 이후 생성된 계정만 귀속·보상).
  res.cookies.set(PENDING_REFERRAL_AT_COOKIE, String(Date.now()), {
    path: '/',
    maxAge: SEVEN_DAYS,
    sameSite: 'lax',
    httpOnly: false,
  });
  return res;
}
