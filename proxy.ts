import { NextResponse, type NextRequest } from 'next/server';

import { updateSession } from '@/lib/auth/middleware';

const IS_PREVIEW = process.env.VERCEL_ENV === 'preview';
const STAGING_KEY = process.env.STAGING_ACCESS_KEY ?? '';
const STAGING_COOKIE = 'stg_access';
/** 스테이징 게이트 예외 — 헬스체크·크론(CRON_SECRET로 별도 보호)·결제 웹훅(외부 발신). */
const STAGING_OPEN = [/^\/api\/health/, /^\/api\/cron\//, /^\/api\/webhooks?\//, /^\/api\/portone\//, /^\/\.well-known\//];

/**
 * 스테이징 접근 게이트(2026-08-29) — preview 배포는 Vercel 보호가 꺼져 있어 URL을 아는 누구나(CBT 참가자 등)
 * 열 수 있었고, 비로그인 공개 페이지(위키)로 미배포 콘텐츠 수치가 새어 나갔다(문의 #156 "파견 15000").
 * `?key=<STAGING_ACCESS_KEY>`로 한 번 들어오면 쿠키를 심고 이후는 자유. 키 미설정이면 게이트를 걸지 않는다
 * (env 누락으로 스테이징이 통째로 잠기는 사고 방지). 프로덕션(VERCEL_ENV=production)엔 아무 영향 없다.
 */
function stagingGate(request: NextRequest): NextResponse | null {
  if (!IS_PREVIEW || !STAGING_KEY) return null;
  const { pathname, searchParams } = request.nextUrl;
  if (STAGING_OPEN.some((re) => re.test(pathname))) return null;
  if (request.cookies.get(STAGING_COOKIE)?.value === STAGING_KEY) return null;
  const key = searchParams.get('key');
  if (key === STAGING_KEY) {
    const url = request.nextUrl.clone();
    url.searchParams.delete('key');
    const res = NextResponse.redirect(url);
    res.cookies.set(STAGING_COOKIE, STAGING_KEY, { httpOnly: true, sameSite: 'lax', secure: true, path: '/', maxAge: 60 * 60 * 24 * 90 });
    return res;
  }
  return new NextResponse('staging', { status: 403, headers: { 'X-Robots-Tag': 'noindex, nofollow' } });
}

/**
 * 플레이스토어 앱(TWA) 표식(2026-09-03, docs/PLAYSTORE.md §3.1) — TWA start_url `/?src=twa`로 들어오면
 * 쿠키 `ig_platform=twa`(1년, httpOnly 아님: 클라 결제 분기가 읽는다)를 심고 쿼리를 지워 리다이렉트.
 * 이후 요청은 lib/platform.ts가 쿠키로 판별. 게임 로직엔 쓰지 않는다(결제 경로·문구 분기 전용).
 */
function twaMarker(request: NextRequest): NextResponse | null {
  const { searchParams } = request.nextUrl;
  if (searchParams.get('src') !== 'twa') return null;
  const url = request.nextUrl.clone();
  url.searchParams.delete('src');
  const res = NextResponse.redirect(url);
  res.cookies.set('ig_platform', 'twa', { httpOnly: false, sameSite: 'lax', secure: true, path: '/', maxAge: 60 * 60 * 24 * 365 });
  return res;
}

// Next.js 16: middleware → proxy. export 함수명 `proxy` 필수.
export async function proxy(request: NextRequest) {
  const gated = stagingGate(request);
  if (gated) return gated;
  const twa = twaMarker(request);
  if (twa) return twa;
  const res = await updateSession(request);
  // preview 배포는 검색엔진에 절대 노출하지 않는다(미배포 콘텐츠 문서가 색인되는 것 방지).
  if (IS_PREVIEW) res.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return res;
}

export const config = {
  matcher: [
    // 정적 자산/이미지/Next 내부 제외 — 나머지 모든 요청 세션 갱신.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
