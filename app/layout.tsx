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
  // PWA: app/manifest.ts가 자동으로 <link rel="manifest"> 주입. 아이콘은 명시.
  icons: {
    icon: [{ url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
    apple: [{ url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
  },
  // iOS 홈 화면 추가 시 standalone(상단 사파리 chrome 제거).
  appleWebApp: {
    capable: true,
    title: '인생강화',
    statusBarStyle: 'black-translucent',
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
  // PWA(홈 화면 실행) 하단/노치 safe-area 활성화 — 없으면 env(safe-area-inset-*)=0이라
  // BottomNav의 pb-[env(safe-area-inset-bottom)]가 무효가 되어 버튼이 홈 인디케이터와
  // 겹쳤음(2026-05-29). viewport-fit은 스케일 속성이 아니라 width=390 자동핏과 무충돌.
  viewportFit: 'cover' as const,
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
      <body className="flex h-full flex-col overscroll-none bg-zinc-950 text-zinc-50">
        {children}
      </body>
    </html>
  );
}
