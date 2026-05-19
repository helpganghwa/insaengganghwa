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
  // width=device-width: 레이아웃 폭 = 기기 실제 폭(375 등). 셸이 w-full max-w-[390px]라
  // ≤390 기기는 기기폭으로 반응(가로 스크롤 0), ≥390은 390 중앙 고정.
  // (width=390 + user-scalable=no 조합은 일부 브라우저가 자동 핏을 무시 → 375서 15px
  //  오버플로·fixed inset-x-0 요소가 body overflow-x-hidden로도 안 잘림 → 반응형으로 전환. CLAUDE §5.2)
  width: 'device-width' as const,
  initialScale: 1,
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
