import type { CapacitorConfig } from '@capacitor/cli';

/**
 * 인생강화 iOS 셸 — docs/APPSTORE.md §3.5.
 * 정적 번들 없이 프로덕션 웹을 그대로 로드(server.url). `?src=ios`로 첫 진입 → proxy가 `ig_platform=ios`
 * 쿠키를 심고, 웹의 결제·푸시·문구 분기가 그 쿠키를 본다. 디버그 빌드에서 sandbox APNs를 쓰려면
 * 웹에 `window.__ganghwaApnsEnv = 'sandbox'`를 세팅하는 디버그 전용 스크립트를 두거나, 서버 등록 후 수동 조정.
 */
const config: CapacitorConfig = {
  appId: 'app.ganghwa.game',
  appName: '인생강화',
  // webDir은 필수 필드지만 server.url을 쓰면 로드에 쓰이지 않는다 — 오프라인/로드 실패 안내 페이지만 둔다.
  webDir: 'www',
  server: {
    url: 'https://ganghwa.app/?src=ios',
    // 외부 도메인(카카오 로그인·결제·위키 새창)은 WebView 안에서 이동을 허용해야 OAuth 콜백이 돌아온다.
    allowNavigation: ['ganghwa.app', '*.ganghwa.app', 'kauth.kakao.com', 'accounts.kakao.com', '*.kakao.com', '*.supabase.co', 'appleid.apple.com'],
  },
  ios: {
    contentInset: 'never',
    scheme: 'ganghwa',
    backgroundColor: '#151518',
    limitsNavigationsToAppBoundDomains: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 800,
      backgroundColor: '#151518',
      launchAutoHide: true,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
