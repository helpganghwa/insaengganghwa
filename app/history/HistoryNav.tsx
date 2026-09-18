'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { PAPER } from '@/app/wiki/theme';

/**
 * 역사 위키 상단 메뉴(2026-09-18) — 연대기(재생) · 길드 · 인물 | 위키 · 게임하기.
 * 길드·인물은 자리만 먼저 만들고 '준비 중' 화면(사용자 결정). 지금 보고 있는 메뉴는 진한 글자로.
 */
const SECTIONS = [
  { href: '/history', label: '연대기' },
  { href: '/history/guilds', label: '길드' },
  { href: '/history/people', label: '인물' },
] as const;

export function HistoryNav({ siteOrigin }: { siteOrigin: string }) {
  const path = usePathname();
  return (
    <nav
      className={`flex items-center gap-0.5 text-[12.5px] sm:gap-1 ${PAPER.muted}`}
      aria-label="역사 위키 메뉴"
    >
      {SECTIONS.map((s) => {
        const on = s.href === '/history' ? path === '/history' : path?.startsWith(s.href);
        return (
          <Link
            key={s.href}
            href={s.href}
            aria-current={on ? 'page' : undefined}
            className={`rounded-md px-1.5 py-1 sm:px-2 ${on ? 'font-bold text-[#2a251e]' : PAPER.hover}`}
          >
            {s.label}
          </Link>
        );
      })}
      <span aria-hidden className="mx-1 h-3.5 w-px bg-[#d8ceb9] sm:mx-1.5" />
      <a href={`${siteOrigin}/wiki`} className={`rounded-md px-1.5 py-1 sm:px-2 ${PAPER.hover}`}>
        위키
      </a>
      <a
        href={`${siteOrigin}/`}
        className={`ml-0.5 rounded-md border px-2 py-1 font-semibold text-[#2a251e] sm:ml-1 sm:px-2.5 ${PAPER.card} ${PAPER.hover}`}
      >
        게임하기
      </a>
    </nav>
  );
}
