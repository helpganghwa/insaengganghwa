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
 *  - related_applications — 같은 서비스의 Play 앱을 선언한다(2026-09-12). 브라우저·OS가 "이 웹은
 *    Play 앱으로도 나와 있다"를 알 수 있는 표준 통로이고, `getInstalledRelatedApps()`로 설치
 *    여부를 물어볼 근거가 된다. ⚠ 다만 **이것만으로 크롬의 PWA 설치 배너가 사라지지는 않는다**
 *    — 억제는 `prefer_related_applications: true`가 해야 하는데, 그러면 앱이 없는 유저
 *    (iOS·데스크톱)의 PWA 설치까지 막히므로 켜지 않는다. 지금은 선언만 해 두고, 앱 설치 유저의
 *    중복 설치를 실제로 막으려면 설치 띠지 쪽에서 getInstalledRelatedApps를 보고 감추는 편이
 *    맞다(별도 회차). iOS·데스크톱은 이 필드를 무시하므로 설치 흐름에 영향이 없다.
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
