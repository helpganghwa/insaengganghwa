'use client';

import { useEffect, useState } from 'react';

import type { WikiSection } from './registry';
import { PAPER } from './theme';

/**
 * 우측 "이 문서" 목차 + 스크롤 추적.
 * 관측이 실패하거나(IntersectionObserver 미지원) JS가 죽어도 목록은 서버에서 이미
 * 렌더된 앵커 링크라 이동은 그대로 된다 — 강조 표시만 빠진다.
 */
export function TocSpy({ sections }: { sections: readonly WikiSection[] }) {
  const [active, setActive] = useState('');

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const nodes = sections
      .map((s) => document.getElementById(s.id))
      .filter((n): n is HTMLElement => n !== null);
    if (nodes.length === 0) return;

    const io = new IntersectionObserver(
      (entries) => {
        // 화면에 걸친 것 중 가장 위 → 읽는 위치와 목차가 어긋나지 않는다.
        const top = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setActive(top.target.id);
      },
      // 상단 헤더(sticky) 높이만큼 잘라내고, 하단은 넉넉히 죽여 "다음 절"로 일찍 넘어가지 않게.
      { rootMargin: '-72px 0px -68% 0px' },
    );
    for (const n of nodes) io.observe(n);
    return () => io.disconnect();
  }, [sections]);

  if (sections.length === 0) return null;

  return (
    <nav aria-label="이 문서" className="text-[12px]">
      <p className={`mb-1.5 font-semibold ${PAPER.muted}`}>이 문서</p>
      <ul className="space-y-0.5">
        {sections.map((s) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              aria-current={active === s.id ? 'location' : undefined}
              className={`block border-l-2 py-1 pl-2 leading-snug ${
                active === s.id
                  ? 'border-current font-semibold'
                  : `border-transparent ${PAPER.muted}`
              }`}
            >
              {s.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
