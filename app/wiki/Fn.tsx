'use client';

import { useState } from 'react';

import { PAPER } from './theme';

/**
 * 각주 참조 [n] — 호버/포커스 시 각주 내용을 툴팁으로 띄운다(나무위키식).
 * 내용은 문서 아래 FnList의 li(#fn-n)에서 그대로 읽어 온다 — 원문 한 벌 유지.
 * 터치(호버 없는 기기)는 툴팁 없이 앵커 점프로 동작한다.
 */
export function Fn({ n }: { n: number }) {
  const [tip, setTip] = useState<{ html: string; x: number; y: number } | null>(null);

  function show(e: React.MouseEvent | React.FocusEvent) {
    const body = document.getElementById(`fn-${n}`)?.querySelector('span:last-of-type');
    if (!body) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const half = 130; // 툴팁 반폭 — 화면 밖으로 나가지 않게 중심을 안쪽으로 민다.
    const x = Math.min(Math.max(r.left + r.width / 2, half + 8), window.innerWidth - half - 8);
    setTip({ html: body.innerHTML, x, y: r.top - 6 });
  }

  return (
    <sup id={`rfn-${n}`} className="scroll-mt-20 text-[11px]">
      <a
        href={`#fn-${n}`}
        className={`no-underline ${PAPER.link}`}
        onMouseEnter={show}
        onMouseLeave={() => setTip(null)}
        onFocus={show}
        onBlur={() => setTip(null)}
      >
        [{n}]
      </a>
      {tip ? (
        <span
          role="tooltip"
          style={{ left: tip.x, top: tip.y }}
          className={`fixed z-40 w-[260px] max-w-[80vw] -translate-x-1/2 -translate-y-full rounded-md border px-3 py-2 text-left text-[12px] leading-[1.7] font-normal break-keep text-[#2a251e] shadow-md ${PAPER.card}`}
          dangerouslySetInnerHTML={{ __html: tip.html }}
        />
      ) : null}
    </sup>
  );
}
