import type { Metadata } from 'next';
import Link from 'next/link';

import { PAPER, SERIF } from '@/app/wiki/theme';

/** 역사 위키 · 길드(2026-09-18) — 메뉴 자리만 먼저. 준비 중 화면(사용자 결정). 내용이 없어 검색 색인은 막는다. */
export const metadata: Metadata = {
  title: '길드',
  robots: { index: false, follow: true },
};

export default function HistoryComingSoonPage() {
  return (
    <main className="mx-auto flex w-full max-w-[560px] flex-col items-start px-5 pt-16 pb-20">
      <div className={`text-[10.5px] tracking-[.2em] ${PAPER.muted}`}>역사 위키</div>
      <h1 className="mt-1 text-[24px] leading-tight font-bold" style={SERIF}>
        길드
      </h1>
      <p className="mt-3 text-[14px] leading-[1.8]">준비 중입니다.</p>
      <Link
        href="/history"
        className="mt-6 rounded-[9px] bg-[#8a4b23] px-4 py-2 text-[12.5px] font-bold text-white"
      >
        연대기 보기
      </Link>
    </main>
  );
}
