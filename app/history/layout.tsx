import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';

const SITE_ORIGIN = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://ganghwa.app';

/**
 * 대륙 연대기 역사 페이지 셸(2026-09-16) — 게임 라우트 그룹 밖의 공개 화면(비로그인 열람, 사용자 확정).
 * 게임 크롬(헤더·하단 내비·채팅)을 상속하지 않고, 지도가 어두운 화면이라 다크 톤으로 고정한다.
 */
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0c0a09' };

export const metadata: Metadata = {
  title: { absolute: '대륙 연대기', template: '%s — 대륙 연대기' },
  description: '인생강화 점령전의 첫날부터 오늘까지, 대륙의 역사를 이어서 재생합니다.',
};

export default function HistoryLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-stone-950 text-stone-100">
      <header className="sticky top-0 z-30 border-b border-stone-800 bg-stone-950/90 backdrop-blur">
        <div className="mx-auto flex h-12 w-full max-w-[1100px] items-center justify-between px-4">
          <Link href="/history" className="text-[15px] font-bold tracking-tight" style={{ fontFamily: "Georgia, 'Apple SD Gothic Neo', serif" }}>
            대륙 연대기
          </Link>
          <nav className="flex items-center gap-4 text-[12px] text-stone-400">
            <span className="font-bold text-stone-100">재생</span>
            <a href={`${SITE_ORIGIN}/guild/map`} className="hover:text-stone-200">세계지도</a>
            <a href={SITE_ORIGIN} className="rounded-full border border-stone-700 px-2.5 py-1 text-stone-300 hover:border-stone-500">인생강화</a>
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}
