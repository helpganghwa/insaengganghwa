import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';

import { PAPER, SERIF } from '@/app/wiki/theme';

const SITE_ORIGIN = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://ganghwa.app';

/**
 * 대륙 연대기 역사 페이지 셸(2026-09-16) — 게임 라우트 그룹 밖의 공개 화면(비로그인 열람, 사용자 확정).
 * 공식 위키와 같은 종이 톤(PAPER/SERIF)을 쓴다(사용자 피드백: 다크보다 양피지 느낌). 지도만 게임과 같은 어두운 무대.
 *
 * ⚠ 루트 <html>에 `dark`가 상시 붙어 있어 재생 패널(ChronicleReplay)의 dark: 변형이 종이 위에서도 살아난다 —
 *   아래 스타일이 그 몇 가지 색만 종이용 잉크로 되돌린다(패널은 게임 화면과 공유하므로 클래스는 손대지 않는다).
 */
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#f5f0e6' };

export const metadata: Metadata = {
  title: { absolute: '대륙 연대기', template: '%s — 대륙 연대기' },
  description: '인생강화 점령전의 첫날부터 오늘까지, 대륙의 역사를 이어서 재생합니다.',
};

const PAPER_INK_CSS = `
.ig-paper .dark\\:text-slate-400{color:#4b4636}
.ig-paper .dark\\:text-stone-400{color:#6d6455}
.ig-paper .dark\\:text-zinc-300{color:#2a251e}
.ig-paper .dark\\:text-zinc-600{color:#9a917f}
.ig-paper .text-zinc-600{color:#2a251e}
@keyframes fadeIn{from{opacity:0;transform:translateY(-3px)}to{opacity:1;transform:none}}
`;

export default function HistoryLayout({ children }: { children: ReactNode }) {
  return (
    <div className={`ig-paper min-h-dvh ${PAPER.page}`}>
      <style dangerouslySetInnerHTML={{ __html: PAPER_INK_CSS }} />
      <header className={`sticky top-0 z-30 border-b backdrop-blur ${PAPER.bar}`}>
        <div className="mx-auto flex h-14 w-full max-w-[1180px] items-center justify-between px-4 md:px-6">
          <Link href="/history" style={SERIF} className="text-[17px] font-bold">
            대륙 연대기
          </Link>
          <nav className={`flex items-center gap-2 text-[12px] ${PAPER.muted}`}>
            <span className="rounded-md px-2 py-1 font-semibold text-[#2a251e]">재생</span>
            <a href={`${SITE_ORIGIN}/wiki`} className={`rounded-md px-2 py-1 ${PAPER.hover}`}>위키</a>
            <a href={`${SITE_ORIGIN}/`} className={`rounded-md border px-2.5 py-1 font-semibold ${PAPER.card} ${PAPER.hover}`}>
              게임으로
            </a>
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}
