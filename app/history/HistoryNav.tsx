'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

import { PAPER } from '@/app/wiki/theme';

/**
 * 역사 위키 상단 메뉴(2026-09-18) — 연대기(재생) · 길드 · 인물 | 게임하기(위키 링크는 09-18 삭제).
 * 길드·인물은 자리만 먼저 만들고 '준비 중' 화면(사용자 결정). 지금 보고 있는 메뉴는 진한 글자로.
 *
 * 서버는 **쿼리스트링으로만** 구분한다(2026-09-21 ⑦) — 선택 UI는 두지 않되, `?s=`를 달고 들어온
 * 사람이 탭을 눌렀다고 1서버로 튕기지 않도록 링크마다 그 값을 이어 붙인다.
 */
const SECTIONS = [
  { href: '/history', label: '연대기' },
  { href: '/history/guilds', label: '길드' },
  { href: '/history/people', label: '인물' },
] as const;

export function HistoryNav({ siteOrigin }: { siteOrigin: string }) {
  const path = usePathname();
  const sp = useSearchParams();
  const srv = sp?.get('s');
  const q = srv && /^\d{1,2}$/.test(srv) && srv !== '1' ? `?s=${srv}` : '';
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
            href={`${s.href}${q}`}
            aria-current={on ? 'page' : undefined}
            className={`rounded-md px-1.5 py-1 sm:px-2 ${on ? 'font-bold text-[#2a251e]' : PAPER.hover}`}
          >
            {s.label}
          </Link>
        );
      })}
      <a
        href={`${siteOrigin}/`}
        className={`ml-1.5 rounded-md border px-2 py-1 font-semibold text-[#2a251e] sm:ml-2.5 sm:px-2.5 ${PAPER.card} ${PAPER.hover}`}
      >
        게임하기
      </a>
    </nav>
  );
}
