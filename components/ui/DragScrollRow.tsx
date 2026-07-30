'use client';

import { useEffect, useRef } from 'react';

/**
 * PC에서도 터치처럼 끌어 넘기는 가로 스크롤 줄(2026-07-31, 문의 — 아바타 관리 PC 탐색 불가).
 *
 * overflow-x 줄은 모바일에선 손가락으로 자연스럽게 넘기지만 PC에선 방법이 없다시피 하다
 * (마우스 드래그 무반응 · 휠은 세로 · 스크롤바는 거의 안 보임 → 키보드 포커스 이동이 유일).
 *
 *  - A. 마우스 드래그 스크롤 — 잡아끌면 이동. 4px 임계값을 넘으면 드래그로 보고
 *       직후의 click을 캡처 단계에서 삼켜 자식 버튼 오클릭을 막는다. 터치는 개입하지
 *       않는다(pointerType 'mouse'만) — 네이티브 관성 스크롤이 더 낫다.
 *  - B. 세로 휠 → 가로 스크롤 변환 — 줄이 실제로 넘칠 때만. React onWheel은 루트에
 *       passive로 붙어 preventDefault가 안 먹으므로 네이티브 리스너를 직접 단다.
 */
export function DragScrollRow({
  className = '',
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const drag = useRef({ startX: 0, startLeft: 0, moved: false, active: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return; // 안 넘치면 페이지 스크롤에 양보
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return; // 트랙패드 가로 제스처는 그대로
      el.scrollLeft += e.deltaY;
      e.preventDefault();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    const el = ref.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    drag.current = { startX: e.clientX, startLeft: el.scrollLeft, moved: false, active: true };
    el.style.cursor = 'grabbing';
    // window에 걸어야 줄 밖으로 나가도 드래그가 이어진다(캡처는 자식 click 합성을 깨서 안 씀).
    const onMove = (ev: PointerEvent) => {
      if (!drag.current.active) return;
      const dx = ev.clientX - drag.current.startX;
      if (Math.abs(dx) > 4) drag.current.moved = true;
      if (drag.current.moved) el.scrollLeft = drag.current.startLeft - dx;
    };
    const onUp = () => {
      drag.current.active = false;
      el.style.cursor = '';
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      // click은 pointerup 직후 발생 — 캡처 억제가 소비한 뒤 다음 틱에 리셋.
      setTimeout(() => {
        drag.current.moved = false;
      }, 0);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <div
      ref={ref}
      onPointerDown={onPointerDown}
      onClickCapture={(e) => {
        if (drag.current.moved) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      className={`select-none overflow-x-auto ${className}`}
    >
      {children}
    </div>
  );
}
