import type { ReactNode } from 'react';
import Link from 'next/link';

import { docsInCat, WIKI_CATS } from './registry';
import { PAPER } from './theme';

/**
 * 위키 3단 셸 — 좌(문서 목록) · 중앙(본문) · 우(이 문서 목차).
 * PC(lg)에서만 3단, 태블릿(md)은 2단, 모바일은 1단 + 상단 ☰ 서랍.
 * 서랍을 <details>로 만든 이유: 읽기 전용 정본에 상태 토글 하나 때문에 클라이언트
 * 컴포넌트를 늘릴 이유가 없다(JS 없이도 열린다).
 */

function DocNav({ activeSlug }: { activeSlug?: string }) {
  return (
    <nav aria-label="문서 목록" className="text-[13px]">
      {WIKI_CATS.map((cat) => {
        const docs = docsInCat(cat);
        if (docs.length === 0) return null;
        return (
          <div key={cat} className="mb-4 last:mb-0">
            <p className={`mb-1 px-2 text-[11px] font-semibold ${PAPER.muted}`}>{cat}</p>
            <ul>
              {docs.map((d) => (
                <li key={d.slug}>
                  <Link
                    prefetch={false}
                    href={`/wiki/${d.slug}`}
                    aria-current={d.slug === activeSlug ? 'page' : undefined}
                    className={`block rounded px-2 py-1.5 ${PAPER.hover} ${
                      d.slug === activeSlug ? `font-semibold ${PAPER.active}` : ''
                    }`}
                  >
                    {d.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

export function WikiShell({
  children,
  toc,
  activeSlug,
}: {
  children: ReactNode;
  toc?: ReactNode;
  activeSlug?: string;
}) {
  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 pt-5 pb-16 md:px-6">
      <details className={`mb-4 rounded-md border md:hidden ${PAPER.card}`}>
        <summary className="cursor-pointer list-none px-3 py-2 text-[13px] font-semibold">
          ☰ 문서 목록
        </summary>
        <div className={`border-t px-2 py-2 ${PAPER.border}`}>
          <DocNav activeSlug={activeSlug} />
        </div>
      </details>

      <div className="md:grid md:grid-cols-[12rem_minmax(0,1fr)] md:gap-8 lg:grid-cols-[12rem_minmax(0,1fr)_11rem]">
        <aside className="hidden md:block">
          <div className="sticky top-[4.5rem] max-h-[calc(100dvh-6rem)] overflow-y-auto">
            <DocNav activeSlug={activeSlug} />
          </div>
        </aside>

        <main className="min-w-0">{children}</main>

        {toc ? (
          <aside className="hidden lg:block">
            <div className="sticky top-[4.5rem] max-h-[calc(100dvh-6rem)] overflow-y-auto">
              {toc}
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
