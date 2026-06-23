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
    '/api/cron/profile-poll': ['./public/sprites/**/*.png'],
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
    ];
  },
};

export default nextConfig;
