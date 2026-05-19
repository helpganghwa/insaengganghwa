import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

import { ThemeProvider } from '@/components/ThemeProvider';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: '인생강화 — insaengganghwa',
  description: '강화는 인생이다.',
  applicationName: 'insaengganghwa',
  formatDetection: { telephone: false },
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
  themeColor: '#0a0a0a',
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body
        className="flex min-h-full flex-col bg-zinc-50 text-zinc-900 dark:bg-black dark:text-zinc-50"
        suppressHydrationWarning
      >
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
