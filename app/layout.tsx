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
  description: '시간기반 idle + 한국식 RPG 강화. 떠나 있어도 강화는 진행된다.',
  applicationName: 'insaengganghwa',
  formatDetection: { telephone: false },
};

export const viewport = {
  themeColor: '#0a0a0a',
  // 고정 390 강제 — width=390만 지정하면 브라우저가 initial-scale을 기기폭/390으로
  // 자동 계산해 390 레이아웃을 화면에 꽉 맞춤(작은 폰 축소·큰 폰 확대, 동일 비율·여백0·스크롤0).
  // ⚠ initial-scale/maximum-scale/user-scalable=no 를 주면 이 자동 핏이 무력화되어
  //   375서 15px 가로 스크롤이 났음 → 스케일 잠금 전부 제거(핀치줌 허용은 감수). CLAUDE §5.2.
  width: 390,
  viewportFit: 'cover' as const, // env(safe-area-inset-*) 활성 — 노치/홈인디케이터 회피
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full overflow-x-hidden antialiased`}
      suppressHydrationWarning
    >
      <body
        className="flex min-h-full flex-col overflow-x-hidden bg-zinc-50 text-zinc-900 dark:bg-black dark:text-zinc-50"
        suppressHydrationWarning
      >
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
