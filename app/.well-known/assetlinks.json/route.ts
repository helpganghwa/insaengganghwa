/**
 * Digital Asset Links(2026-09-03, docs/PLAYSTORE.md §3.1) — 안드로이드 TWA가 이 도메인을 "자기 콘텐츠"로
 * 열 수 있게(URL바 없이 전체화면) 앱 서명 인증서 지문을 공개한다. 지문이 틀리면 앱이 크롬 커스텀탭처럼
 * 주소창을 띄울 뿐 동작은 한다.
 *
 * env:
 *  - PLAY_PACKAGE_NAME      기본 app.ganghwa.game
 *  - PLAY_ASSETLINKS_SHA256 Play Console > 앱 무결성 > 앱 서명 인증서 SHA-256(콜론 구분). 업로드 키 지문도
 *                           쉼표로 병기 가능(내부 테스트 빌드가 업로드 키로 서명되는 경우 대비).
 * 미설정이면 404 — 잘못된 빈 배열을 내보내 검증을 "실패"로 캐시시키지 않기 위해.
 * get_login_creds는 크롬 비밀번호 관리자의 자격증명 공유용(무해, 권장 기본 포함).
 */
export const dynamic = 'force-dynamic';

const SHA256_RE = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;

export function GET() {
  const pkg = (process.env.PLAY_PACKAGE_NAME || 'app.ganghwa.game').trim();
  const prints = (process.env.PLAY_ASSETLINKS_SHA256 ?? '')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter((s) => SHA256_RE.test(s));
  if (prints.length === 0) return new Response('not configured', { status: 404 });
  const body = [
    {
      relation: ['delegate_permission/common.handle_all_urls', 'delegate_permission/common.get_login_creds'],
      target: { namespace: 'android_app', package_name: pkg, sha256_cert_fingerprints: prints },
    },
  ];
  return Response.json(body, {
    headers: { 'Cache-Control': 'public, max-age=3600', 'X-Robots-Tag': 'noindex' },
  });
}
