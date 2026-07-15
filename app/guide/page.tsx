import type { Metadata } from 'next';
import Link from 'next/link';

import { PublicFooter } from '@/components/PublicFooter';

import { GuideClient } from './GuideClient';

/**
 * 게임 안내 — 전 콘텐츠 설명(2026-07-14, 페이지별 투어 대체).
 * 본문은 GuideClient(4×3 카테고리 그리드 + 선택 카테고리만 표시, 해시 동기화).
 * GNB 위 GuideTicker 탭·/me 메뉴에서 진입. 정적 콘텐츠(DB 무접촉).
 *
 * ⚠ 공개 라우트(2026-07-15, SEO 검수 B1) — (game) 인증 게이트 밖. 검색·AI 크롤러가 읽는
 * 게임 시스템 설명의 단일 공개 소스. 게임 셸 대신 얇은 공개 셸(상단 바 + PublicFooter),
 * 로그인 유저 진입 경로(티커·프로필 메뉴)는 URL 불변이라 그대로 동작.
 */
export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: '게임 가이드',
  description:
    '인생강화 콘텐츠 가이드 — 강화·보급·초월·전투력·레이드·대난투·길드·점령전·아바타까지 시스템 전반을 설명합니다.',
};

export default function GuidePage() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[390px] flex-col bg-white text-zinc-900 dark:bg-black dark:text-zinc-50">
      {/* 공개 셸 상단 바 — 게임 GNB 대신. 로그인 여부 무관 '/'가 알아서 분기(게스트→로그인). */}
      <div className="flex items-center justify-between px-4 pb-1 pt-4">
        <h1 className="text-base font-extrabold">📖 게임 안내</h1>
        <Link
          href="/"
          className="rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 px-3 py-1.5 text-[12px] font-extrabold text-amber-950 active:opacity-90"
        >
          게임 시작 ⚒️
        </Link>
      </div>
      <main className="flex-1">
        <GuideClient />
      </main>
      <PublicFooter />
    </div>
  );
}
