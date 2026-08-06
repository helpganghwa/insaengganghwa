import type { NextConfig } from 'next';

// 정적 픽셀 에셋(스프라이트/OG/아이콘)은 파일명이 바뀌지 않으므로 장기 캐시.
// 배포 시 파일이 갱신되면 CDN은 새 배포로 무효화되고, 브라우저는 SWR로
// 백그라운드 재검증. 로딩 오버레이 스프라이트가 즉시 뜨도록 핵심.
const LONG_CACHE = 'public, max-age=604800, stale-while-revalidate=2592000';

const nextConfig: NextConfig = {
  // turbopack root 명시 제거 — Vercel build의 modifyConfig 단계가
  // import.meta.dirname을 undefined로 받아 path TypeError 발생. Next 16에서
  // turbopack은 default이며 root는 자동 추론으로 충분.
  allowedDevOrigins: ['localhost', '127.0.0.1'],
  // 프로필 생성 cron(v3 compose)이 런타임에 장비 스프라이트 PNG를 readFileSync(vision 입력)로
  // 읽으므로, 해당 서버리스 함수 번들에 public 스프라이트를 강제 포함(미포함 시 비전이 조용히
  // 텍스트로 degrade됨). 정적 분석으로는 추적 안 되는 동적 경로라 명시 포함 필요.
  outputFileTracingIncludes: {
    // 프로필 생성(v3 compose)이 런타임에 장비 스프라이트 PNG를 readFileSync(vision 입력)로 읽는다.
    // 주 발주 경로는 /me/create의 after()가 즉시 실행하는 drainQueue이고, cron/profile-poll은 백스톱.
    // 두 함수 번들 모두에 스프라이트를 강제 포함해야 비전 입력이 텍스트로 조용히 degrade되지 않는다.
    // 슬롯 3디렉토리만(2026-08-06) — sprites/** 전체는 빌드 입력물(anim3-raw·pool 등 ~21MB)까지
    // 함수 번들에 실어 33.7MB였다. compose-v3가 읽는 건 SPRITE_MANIFEST 경로(weapon/armor/accessory)뿐.
    '/api/cron/profile-poll': [
      './public/sprites/weapon/*.png',
      './public/sprites/armor/*.png',
      './public/sprites/accessory/*.png',
    ],
    '/me/create': [
      './public/sprites/weapon/*.png',
      './public/sprites/armor/*.png',
      './public/sprites/accessory/*.png',
    ],
  },
  async headers() {
    return [
      {
        // 클라이언트 힌트로 기기 모델 요청 — 크롬 UA 감축(모델→'K')으로 User-Agent에
        // 모델이 안 보여도 Sec-CH-UA-Model로 폴더블 판별(generateViewport). Critical-CH로
        // 첫 내비게이션에 즉시 힌트 포함(브라우저 1회 재요청), Vary로 캐시 분기.
        source: '/:path*',
        headers: [
          { key: 'Accept-CH', value: 'Sec-CH-UA-Model' },
          { key: 'Critical-CH', value: 'Sec-CH-UA-Model' },
          { key: 'Vary', value: 'Sec-CH-UA-Model' },
          // 보안 헤더(방어심층). script/style/connect는 외부 SDK(카카오·포트원·Supabase)
          // 깨짐 방지로 CSP에서 제한하지 않고, 클릭재킹·base/object 변조만 막는다.
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Content-Security-Policy', value: "object-src 'none'; base-uri 'self'; frame-ancestors 'self'" },
        ],
      },
      {
        source: '/sprites/:path*',
        headers: [{ key: 'Cache-Control', value: LONG_CACHE }],
      },
      {
        // 효과음 오디오(public/audio/sfx) — 파일명 불변, 장기 캐시.
        source: '/audio/:path*',
        headers: [{ key: 'Cache-Control', value: LONG_CACHE }],
      },
      {
        source: '/og-bg/:path*',
        headers: [{ key: 'Cache-Control', value: LONG_CACHE }],
      },
      {
        source: '/:icon(icon\\.png|icon-192\\.png|icon-512\\.png)',
        headers: [{ key: 'Cache-Control', value: LONG_CACHE }],
      },
      // 정적 자산 장기 캐시 누락분(2026-08-06 감사) — 파일명 불변 자산만. ⚠ '/og/:path*' 전체로
      // 걸면 동적 OG 라우트(/og/[shareCode])까지 7일 캐시돼 프로필 갱신이 안 보인다 — 정적
      // 파일 패턴만 좁게 지정한다.
      {
        source: '/og/raid/:path*', // 카카오 레이드 초대 카드(사전 합성 PNG) — 크롤러 반복 요청
        headers: [{ key: 'Cache-Control', value: LONG_CACHE }],
      },
      {
        source: '/og/:file(og-\\d+\\.png)',
        headers: [{ key: 'Cache-Control', value: LONG_CACHE }],
      },
      {
        source: '/icons/:path*', // PWA 스플래시 4장(~1MB) 포함
        headers: [{ key: 'Cache-Control', value: LONG_CACHE }],
      },
      {
        source: '/kakao/:path*',
        headers: [{ key: 'Cache-Control', value: LONG_CACHE }],
      },
      {
        source: '/fx/:path*',
        headers: [{ key: 'Cache-Control', value: LONG_CACHE }],
      },
      {
        source: '/rating/:path*', // 게임물 등급 심볼
        headers: [{ key: 'Cache-Control', value: LONG_CACHE }],
      },
      {
        source: '/:file(login-hero\\.webp|og\\.webp|cbt-ended\\.webp)',
        headers: [{ key: 'Cache-Control', value: LONG_CACHE }],
      },
    ];
  },
};

export default nextConfig;
