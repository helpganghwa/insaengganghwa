import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';

import { WIKI_LINKS } from './registry';
import { PAPER, SERIF } from './theme';
import { WikiSearch } from './WikiSearch';

/**
 * 공식 위키 셸 — 게임 라우트 그룹 (game) 밖이라 앱 헤더·하단 내비·채팅·BGM 같은
 * 게임 크롬을 상속하지 않는다(루트 레이아웃이 감싸는 건 JSON-LD·에러 리포터·픽셀뿐).
 * 편집 기능 없음 — 운영이 관리하는 정본을 읽기만 한다.
 */

// 루트(app/layout.tsx)는 게임 셸 전제로 고정 `width=390`을 내보낸다. 위키는 PC 3단 문서
// 화면이라 그 스케일이 맞지 않아 여기서 되돌린다(가장 깊은 세그먼트의 viewport가 이긴다).
// themeColor도 위키 종이 배경(PAPER.page)에 맞춰 재정의 — 루트의 다크 값이 브라우저
// 크롬(주소창)에 남으면 종이 화면 위가 검게 뜬다.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#f5f0e6',
};

// 문서는 상수·정적 데이터만 읽는다 — 요청 경로에 DB도 동적 API도 없다.
export const dynamic = 'force-static';

export const metadata: Metadata = {
  // absolute — 루트 template('%s — 인생강화')이 위키 첫 화면 제목에 겹치는 것을 끊는다.
  // template은 하위 문서에만 적용된다("강화 — 인생강화 위키").
  title: { absolute: '인생강화 위키', template: '%s — 인생강화 위키' },
  description: '인생강화 공식 위키 — 강화·초월·보급·레이드·길드·계정 규칙을 한곳에 모았다.',
};

export default function WikiLayout({ children }: { children: ReactNode }) {
  return (
    <div className={`min-h-dvh ${PAPER.page}`}>
      <header className={`sticky top-0 z-30 border-b backdrop-blur ${PAPER.bar}`}>
        <div className="mx-auto flex h-14 w-full max-w-[1180px] items-center justify-between px-4 md:px-6">
          <Link href="/wiki" style={SERIF} className="text-[17px] font-bold">
            인생강화 위키
          </Link>
          <div className="flex items-center gap-2">
            <WikiSearch docs={WIKI_LINKS} />
            {/* 게임으로는 통짜 이동 — 소프트 내비게이션은 루트 레이아웃을 다시 렌더하지 않아
                위 viewport 재정의가 게임 화면(고정 390)까지 따라간다. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              className={`rounded-md border px-2.5 py-1 text-[12px] font-semibold ${PAPER.card} ${PAPER.hover}`}
            >
              게임으로
            </a>
          </div>
        </div>
      </header>

      {children}
    </div>
  );
}
