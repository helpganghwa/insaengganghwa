/**
 * 오프라인 폴백(2026-09-11 전수조사) — 앱(TWA)에는 주소창이 없어, 네트워크가 끊긴 채 열면
 * 크롬 기본 오류 페이지가 앱 전체를 차지한다. 브랜딩이 없어 "앱이 고장났다"로 읽힌다.
 * 서비스워커가 내비게이션 실패 시 이 화면을 대신 보여 준다(public/sw.js).
 *
 * ⚠ 스타일은 전부 인라인이다(2026-09-12 재검수) — 서비스워커가 캐시하는 건 이 HTML 한 장뿐이고,
 *   이 문서가 참조하는 /_next/static/css/*는 캐시에 없다. 디스크 캐시에서 밀린 기기(설치 직후·
 *   축출 후)에서는 스타일시트를 못 받아 **글자만 남은 화면**이 뜬다. 외부 CSS에 기대지 않는다.
 */
export const dynamic = 'force-static';

export const metadata = { title: '연결 확인', robots: { index: false } };

export default function OfflinePage() {
  return (
    <main
      style={{
        display: 'flex',
        minHeight: '100dvh',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#09090b',
        padding: '0 32px',
        textAlign: 'center',
      }}
    >
      <p style={{ fontSize: 34, margin: 0 }} aria-hidden>
        🔌
      </p>
      <h1 style={{ margin: '12px 0 0', fontSize: 16, fontWeight: 800, color: '#f4f4f5' }}>
        인터넷 연결을 확인해 주세요
      </h1>
      <p
        style={{
          margin: '8px 0 0',
          fontSize: 12.5,
          lineHeight: 1.7,
          color: '#a1a1aa',
          wordBreak: 'keep-all',
        }}
      >
        모루는 그대로 있습니다. 연결이 돌아오면 하던 강화도 그대로 이어집니다.
      </p>
      {/* 서버 컴포넌트라 onClick을 못 쓴다 — 같은 주소로 다시 들어가는 링크가 곧 재시도다. */}
      <a
        href="/"
        style={{
          marginTop: 24,
          borderRadius: 12,
          background: '#f59e0b',
          padding: '12px 24px',
          fontSize: 14,
          fontWeight: 800,
          color: '#451a03',
          textDecoration: 'none',
        }}
      >
        다시 시도
      </a>
    </main>
  );
}
