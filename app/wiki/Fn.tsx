'use client';

import { useRef, useState } from 'react';

import { PAPER } from './theme';

/**
 * 각주 참조 [n] — 호버/포커스 시 각주 내용을 툴팁으로 띄운다(나무위키식).
 * 내용은 문서 아래 FnList의 li(#fn-n)에서 그대로 읽어 온다 — 원문 한 벌 유지.
 * 툴팁 위로 마우스를 옮겨도 꺼지지 않도록 숨김을 잠깐 늦추고, 툴팁 자신도 호버를 잡는다
 * (각주 안 링크를 누를 수 있어야 한다). 터치 기기는 앵커 점프로 동작한다.
 */
export function Fn({ n }: { n: number }) {
  const [tip, setTip] = useState<{ html: string; x: number; y: number } | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function cancelHide() {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }

  function scheduleHide() {
    cancelHide();
    hideTimer.current = setTimeout(() => setTip(null), 200);
  }

  function show(e: React.MouseEvent | React.FocusEvent) {
    cancelHide();
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
        onMouseLeave={scheduleHide}
        onFocus={show}
        onBlur={scheduleHide}
      >
        [{n}]
      </a>
      {tip ? (
        <span
          role="tooltip"
          style={{ left: tip.x, top: tip.y }}
          onMouseEnter={cancelHide}
          onMouseLeave={scheduleHide}
          className={`fixed z-40 w-[260px] max-w-[80vw] -translate-x-1/2 -translate-y-full rounded-md border px-3 py-2 text-left text-[12px] leading-[1.7] font-normal break-keep text-[#2a251e] shadow-md ${PAPER.card}`}
          dangerouslySetInnerHTML={{ __html: tip.html }}
        />
      ) : null}
    </sup>
  );
}
