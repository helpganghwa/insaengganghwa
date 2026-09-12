import { NextResponse, type NextRequest } from 'next/server';

import { updateSession } from '@/lib/auth/middleware';

const IS_PREVIEW = process.env.VERCEL_ENV === 'preview';
const STAGING_KEY = process.env.STAGING_ACCESS_KEY ?? '';
const STAGING_COOKIE = 'stg_access';
/** 스테이징 게이트 예외 — 헬스체크·크론(CRON_SECRET로 별도 보호)·결제 웹훅(외부 발신). */
const STAGING_OPEN = [
  /^\/api\/health/,
  /^\/api\/cron\//,
  /^\/api\/webhooks?\//,
  /^\/api\/portone\//,
  /^\/\.well-known\//,
  // 서비스워커가 설치 때 받아 두는 오프라인 폴백 — 게이트에 막히면 스테이징에선 폴백이 아예
  // 안 깔려(cache.add 실패) 검수 자체가 불가능하다. 정적 안내 화면이라 새어도 무해하다.
  /^\/offline$/,
];

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
/**
 * 위키 서브도메인 가드(2026-09-11 전수조사) — `wiki.ganghwa.app`은 위키를 브라우저 뷰로 분리해
 * 여는 용도의 별칭일 뿐인데, 같은 배포라 게임 전체를 서빙하고 있었다. 앱에서 위키로 나갔다가
 * "게임으로"를 누르면 **다른 오리진의 게임**이 열려 세션이 없고, 그쪽에서 로그인하면 결제가
 * 포트원으로 흐른다(앱 표식이 없으므로). 위키 외 경로는 본 도메인으로 되돌린다.
 */
const WIKI_HOST = 'wiki.ganghwa.app';
const CANONICAL_HOST = 'ganghwa.app';

function wikiHostGuard(request: NextRequest): NextResponse | null {
  if (request.nextUrl.hostname !== WIKI_HOST) return null;
  const p = request.nextUrl.pathname;
  // 위키 본문과 그 렌더에 필요한 정적 자산만 남긴다.
  // /api/client-error는 예외로 통과시킨다 — 리다이렉트되면 교차 오리진이 되어 에러 리포트가
  // 통째로 유실되고, 위키 호스트의 클라 오류 관측이 0이 된다(2026-09-12 재검수).
  if (
    p === '/wiki' ||
    p.startsWith('/wiki/') ||
    p.startsWith('/_next/') ||
    p.startsWith('/sprites/') ||
    p.startsWith('/icons/') ||
    p.startsWith('/fx/') ||
    p === '/api/client-error'
  ) {
    return null;
  }
  const url = request.nextUrl.clone();
  url.hostname = CANONICAL_HOST;
  if (p === '/') url.pathname = '/wiki';
  return NextResponse.redirect(url);
}

function twaMarker(request: NextRequest): NextResponse | null {
  const { searchParams } = request.nextUrl;
  if (searchParams.get('src') !== 'twa') return null;
  // ⚠ UA를 함께 본다(2026-09-12 6차 검수). 종전엔 `?src=twa`가 붙기만 하면 **어떤 브라우저든**
  // 표식을 받았다. 이 주소가 공유·북마크·광고로 돌면 데스크톱·아이폰 유저도 앱으로 판정돼
  // 그 세션 내내 결제가 "플레이스토어에서 설치한 앱에서만 결제할 수 있어요"로 막힌다 — 웹 결제가
  // 16시간 멈췄던 사고(2026-09-11)와 같은 형태다. TWA는 안드로이드 전용이므로 UA로 거른다.
  if (!/Android/i.test(request.headers.get('user-agent') ?? '')) return null;
  const url = request.nextUrl.clone();
  url.searchParams.delete('src');
  // 해시로 표식을 넘긴다 — 해시는 서버로 가지 않고 이 내비게이션에만 붙으므로, 쿠키와 달리
  // 같은 기기의 다른 크롬 탭으로 새지 않는다. 클라(AppSessionMark)가 읽어 sessionStorage에
  // 옮기고 즉시 지운다. 쿠키가 새어 브라우저 결제가 막혔던 사고(2026-09-11)의 재발 방지.
  url.hash = 'app';
  const res = NextResponse.redirect(url);
  res.cookies.set('ig_platform', 'twa', { httpOnly: false, sameSite: 'lax', secure: true, path: '/', maxAge: 60 * 60 * 24 * 365 });
  return res;
}

// Next.js 16: middleware → proxy. export 함수명 `proxy` 필수.
export async function proxy(request: NextRequest) {
  const wiki = wikiHostGuard(request);
  if (wiki) return wiki;
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
