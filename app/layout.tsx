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
  // width=390만 지정(initialScale 미지정) → 브라우저가 390 레이아웃을 기기폭에 자동 맞춤.
  // 375 등 <390 기기에서 ~0.96배로 축소되어 동일 비율·가로 스크롤 0 (CLAUDE §5.2).
  // initialScale:1을 주면 자동 핏이 꺼져 375서 15px 오버플로(가로 스크롤) 발생 — 제거함.
  width: 390,
  maximumScale: 1,
  userScalable: false,
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
