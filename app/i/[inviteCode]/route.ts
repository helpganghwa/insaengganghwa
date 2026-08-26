import { NextResponse, type NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { profiles } from '@/lib/db/schema/profiles';
import {
  PENDING_REFERRAL_COOKIE,
  PENDING_REFERRAL_AT_COOKIE,
  PENDING_REFERRAL_SRV_COOKIE,
} from '@/lib/game/referral/auto-attribute';

/**
 * 익명 초대 링크(0174) — /i/<invite_code>.
 *
 * /s/<public_code>는 초대자의 불변 공개 코드가 링크에 노출되고 공개 프로필로 착지해
 * "뿌리기 꺼려진다"는 피드백 — 링크 복사 전용으로 역추적 불가 코드를 쓴다. 프로필 착지
 * 없이 항상 가입 동선(/login)으로만 보낸다. 카카오 공유는 기존 /s 유지(자랑 카드 어필).
 *
 * 흐름은 /s의 start 동선과 동일(인앱 브라우저 탈출로 추천 쿠키 유실 방지):
 *  (A) 최초 진입 → 쿠키 없이 /go?next=/i/<code>?go=1 — 인앱이면 탈출 유도, 일반 브라우저는
 *      /go가 자동 통과시킨다. 인앱에서 쿠키를 세팅하면 외부 브라우저로 안 넘어가 유실된다.
 *  (B) ?go=1(탈출 완료·일반 브라우저) → invite_code를 public_code로 해석해 기존
 *      pending_referral 쿠키(값=public_code)를 세팅 — 하위 귀속 파이프라인 변경 없음.
 */
const SEVEN_DAYS = 7 * 24 * 60 * 60;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ inviteCode: string }> },
) {
  const { inviteCode } = await params;
  const sParam = req.nextUrl.searchParams.get('s');
  const sQuery = sParam && /^\d+$/.test(sParam) ? `&s=${sParam}` : '';

  // (A) 탈출 게이트 경유 — 쿠키는 (B)에서만.
  if (req.nextUrl.searchParams.get('go') !== '1') {
    const next = `/i/${encodeURIComponent(inviteCode)}?go=1${sQuery}`;
    return NextResponse.redirect(
      new URL(`/go?next=${encodeURIComponent(next)}`, req.nextUrl.origin),
      307,
    );
  }

  // (B) invite_code → public_code 해석 후 기존 추천 쿠키 세팅.
  let publicCode: string | null = null;
  try {
    const [row] = await db
      .select({ publicCode: profiles.publicCode })
      .from(profiles)
      .where(eq(profiles.inviteCode, inviteCode))
      .limit(1);
    publicCode = row?.publicCode ?? null;
  } catch (e) {
    console.warn('[i/route.lookup]', (e as Error).message);
  }

  const res = NextResponse.redirect(new URL('/login', req.nextUrl.origin), 307);
  // 무효 코드면 귀속 없이 로그인으로만 — 초대 링크가 죽은 링크가 되지는 않게.
  if (!publicCode) return res;

  if (sParam && /^\d+$/.test(sParam)) {
    // 공유된 서버를 로그인 기본 선택 + 링크 생성 서버 박제(/s와 동일, SERVER.md 경계규칙 4).
    res.cookies.set('pending_server', sParam, { sameSite: 'lax', path: '/', maxAge: SEVEN_DAYS });
    res.cookies.set(PENDING_REFERRAL_SRV_COOKIE, sParam, { sameSite: 'lax', path: '/', maxAge: SEVEN_DAYS });
  }
  res.cookies.set(PENDING_REFERRAL_COOKIE, publicCode, {
    path: '/',
    maxAge: SEVEN_DAYS,
    sameSite: 'lax',
    httpOnly: false,
  });
  res.cookies.set(PENDING_REFERRAL_AT_COOKIE, String(Date.now()), {
    path: '/',
    maxAge: SEVEN_DAYS,
    sameSite: 'lax',
    httpOnly: false,
  });
  return res;
}
