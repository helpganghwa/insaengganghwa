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
  width: 390,
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover' as const, // env(safe-area-inset-*) 활성 — 노치/홈인디케이터 회피
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
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
