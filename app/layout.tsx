import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  // 절대 URL — manifest·OG·icons가 절대 경로로 직렬화되어야 PWA 설치 정상.
  metadataBase: new URL('https://insaengganghwa.com'),
  title: '인생강화 — insaengganghwa',
  description: '강화는 인생이다.',
  applicationName: 'insaengganghwa',
  formatDetection: { telephone: false },
  // PWA: app/manifest.ts가 자동으로 <link rel="manifest"> 주입.
  // 아이콘은 app/icon.png(favicon) + app/apple-icon.png(iOS)도 Next convention으로
  // 자동 주입되지만, 사이즈/타입 명시를 위해 metadata에도 두 번 선언(중복 무해).
  icons: {
    icon: [{ url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
    apple: [{ url: '/apple-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  // iOS 홈 화면 추가 시 standalone(상단 사파리 chrome 제거) + 스플래쉬 화면.
  // iOS는 manifest를 읽지 않으므로 apple-touch-startup-image link로 직접 지정.
  // 디바이스별 media query 매칭 필수(매칭 안 되면 백색 빈 화면).
  appleWebApp: {
    capable: true,
    title: '인생강화',
    statusBarStyle: 'black-translucent',
    startupImage: [
      // iPhone 14/15 Pro Max (6.7") — 1290x2796
      {
        url: '/icons/splash-1290x2796.png',
        media:
          '(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)',
      },
      // iPhone 14/15 (6.1") — 1179x2556
      {
        url: '/icons/splash-1179x2556.png',
        media:
          '(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)',
      },
      // iPhone 12/13/14 (6.1") — 1170x2532
      {
        url: '/icons/splash-1170x2532.png',
        media:
          '(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)',
      },
      // iPhone 8/SE 2-3 (4.7") — 750x1334
      {
        url: '/icons/splash-750x1334.png',
        media:
          '(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)',
      },
    ],
  },
};

// 고정 390 — 출력 메타는 정확히 `<meta name="viewport" content="width=390">`.
// width=390만 있으면 브라우저가 initial-scale=기기폭/390을 자동 계산해 390 레이아웃을
// 화면에 꽉 맞춤(작은 폰 축소·큰 폰 확대, 모든 화면 동일 비율·좌우 여백0·가로 스크롤0).
// ⚠ initial-scale/maximum-scale/user-scalable=no 중 하나라도 들어가면 이 자동 핏이
//   무력화되어 375서 15px 가로 스크롤(검증됨).
//
// ⚠⚠ `initialScale: undefined`는 절대 제거 금지(불필요해 보여도). Next는 viewport
//   export를 기본값 `{ width:'device-width', initialScale:1 }`과 스프레드 병합한 뒤
//   null/undefined가 아닌 필드만 직렬화한다. 즉 `{ width:390 }`만 두면 기본값의
//   initialScale:1 이 살아남아 출력이 `width=390, initial-scale=1` → 375 가로 스크롤
//   재발. `initialScale: undefined`로 기본값 1을 덮어써야 출력에서 빠진다. 이것이
//   metadata API로 순수 width=390을 내는 유일한 방법(리터럴 <meta>는 Next 주입분과
//   중복되어 불가). CLAUDE §5.2.
export const viewport = {
  themeColor: '#151518',
  width: 390,
  initialScale: undefined,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // ⚠ html/body에 overflow-x(예: overflow-x-hidden) 절대 금지. overflow가 한 축에만
  //   걸리면 다른 축이 visible→auto로 계산돼 body가 스크롤 컨테이너가 되고,
  //   AppHeader(sticky top-0)·BottomNav(sticky bottom-0)가 실제 스크롤 안 하는
  //   컨테이너 기준이 되어 고정이 풀린다(검증됨). width=390 뷰포트라 가로 오버플로
  //   자체가 없어 가드 불필요. 특정 요소가 390 초과 시 그 요소를 고치고 여기 금지.
  return (
    <html
      lang="ko"
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full overscroll-none antialiased`}
    >
      <body className="flex min-h-full flex-col overscroll-none bg-zinc-950 text-zinc-50">
        {/* 큰 화면(폴드 펼침·태블릿, screen.width≥600) — width=390 고정 스케일 과확대 회피.
            폭 모드가 실제로 바뀔 때만 viewport 재설정(가드 W) → 스크롤 중 resize로 인한
            재설정·끊김 방지. 폰(<600)은 Next 출력(width=390) 그대로. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              // 큰 화면(≥520)은 device-width로 전환(폴드/태블릿 과확대 방지). setAttribute는
              // 안드 크롬이 초기 스케일을 캐시해 반영 안 되는 경우가 있어, meta를 제거+재생성해
              // viewport를 강제 재계산. 폰(<520)은 width=390 유지.
              "(function(){function w(){return Math.max((window.screen&&screen.width)||0,window.innerWidth||0);}function a(){var width=w();try{document.documentElement.dataset.vw=String(width);}catch(e){}var c=width>=520?'width=device-width, initial-scale=1, viewport-fit=cover':'width=390';var m=document.querySelector('meta[name=viewport]');if(m&&m.getAttribute('content')===c)return;if(m&&m.parentNode)m.parentNode.removeChild(m);m=document.createElement('meta');m.setAttribute('name','viewport');m.setAttribute('content',c);document.head.appendChild(m);}a();window.addEventListener('resize',a);window.addEventListener('orientationchange',a);})();",
          }}
        />
        {children}
      </body>
    </html>
  );
}
