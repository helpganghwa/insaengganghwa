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
 *  - related_applications — 같은 서비스의 Play 앱을 선언한다(2026-09-12 6차 검수). 없으면 앱을
 *    이미 설치한 유저의 크롬에도 설치 배너가 계속 뜨고, 누르면 WebAPK가 따로 깔려 **홈 화면에
 *    같은 이름 아이콘이 두 개** 생긴다. 그 PWA는 Play 결제를 못 써 포트원으로 흐르므로 유저
 *    눈엔 "앱인데 결제창이 다르다"로 보인다. prefer_related_applications는 켜지 않는다 —
 *    앱이 없는 유저(iOS·데스크톱)에게는 PWA 설치가 여전히 정상 경로다.
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
    related_applications: [{ platform: 'play', id: 'app.ganghwa.game', url: 'https://play.google.com/store/apps/details?id=app.ganghwa.game' }],
    prefer_related_applications: false,
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
