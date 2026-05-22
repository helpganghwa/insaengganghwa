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
  async headers() {
    return [
      {
        source: '/sprites/:path*',
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
