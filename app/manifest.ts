import type { MetadataRoute } from 'next';

/**
 * PWA 매니페스트 — Next 16 권장 `app/manifest.ts`. 모든 페이지에 자동으로
 * `<link rel="manifest">` 주입(별도 layout 작업 불필요).
 *
 * 정책:
 *  - display: 'standalone' — 홈 화면 추가 시 상단 브라우저 chrome 제거, 게임 같은 UX.
 *  - orientation: 'portrait' — 모바일 세로 전용 UI(고정 390 컬럼, CLAUDE §5.2).
 *  - background_color/theme_color: layout.tsx viewport.themeColor와 동기(#151518).
 *  - icons: any + maskable 두 purpose 모두 제공(안드로이드 마스킹 대응).
 *  - id: '/' — 홈 추가 후 같은 origin 다른 path와 별도 PWA로 인식되지 않도록 고정.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '인생강화',
    short_name: '인생강화',
    description: '강화는 인생이다 — 시간기반 RPG 강화 게임.',
    start_url: '/',
    id: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#151518',
    theme_color: '#151518',
    lang: 'ko',
    categories: ['games', 'entertainment'],
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
