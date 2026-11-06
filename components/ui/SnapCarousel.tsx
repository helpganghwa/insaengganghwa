'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * 한 장씩 넘기는 배너 캐러셀(2026-11-06 업데이트 18) — swiper(약 27KB gz)를 CSS scroll-snap + 점 표시로 대체.
 *
 * 홈 배너·상점 배너가 쓰던 swiper 설정(한 장씩·자동 넘김 없음·점 클릭 이동)과 같은 동작:
 *  - 끌어 넘기기(터치·마우스 공통): 가로 손짓은 JS가 따라가고(`touch-action: pan-y` — 세로 스크롤은 브라우저 몫),
 *    놓으면 swiper 규칙으로 한 장 이동한다 — ① 300ms 안의 짧은 튕김은 거리와 상관없이(5px 초과) 그 방향으로 한 장
 *    (2026-11-06 업데이트 18 보완: 네이티브 스냅은 120px 빠른 튕김에서 제자리로 돌아왔다) ② 천천히 끌면 폭의 절반을 넘겨야
 *    한 장(마우스는 종전처럼 30px). 끄는 동안만 스냅을 풀고, 끌고 난 직후의 click은 삼켜 배너 링크 오클릭을 막는다.
 *    세로로 먼저 움직이면(45° 기준) 끌기로 잡지 않는다 — 브라우저가 세로 스크롤을 가져가면 pointercancel로 제자리 복귀.
 *  - 스냅: `scroll-snap-type: x mandatory` + `scroll-snap-stop: always`(키보드·트랙패드 가로 스크롤도 한 장씩).
 *  - 점: 현재 장 표시 + 누르면 그 장으로 이동. 모양·위치는 globals.css `.snap-dots`(종전 swiper 점과 같은 값).
 */
export function SnapCarousel({
  slides,
  gap = 0,
  className = '',
  slideClassName = '',
}: {
  slides: ReactNode[];
  /** 장 사이 간격(px) — swiper spaceBetween과 같은 의미. */
  gap?: number;
  className?: string;
  slideClassName?: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const drag = useRef({ startX: 0, startLeft: 0, moved: false, active: false });

  const step = () => {
    const el = trackRef.current;
    return el ? el.clientWidth + gap : 1;
  };
  const goTo = (i: number, smooth = true) => {
    const el = trackRef.current;
    if (!el) return;
    const idx = Math.max(0, Math.min(slides.length - 1, i));
    el.scrollTo({ left: idx * step(), behavior: smooth ? 'smooth' : 'auto' });
  };

  // 현재 장 — 스크롤 위치에서 가장 가까운 장.
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const onScroll = () => {
      const i = Math.round(el.scrollLeft / (el.clientWidth + gap));
      setActive((prev) => (prev === i ? prev : i));
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [gap]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.isPrimary) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const el = trackRef.current;
    if (!el) return;
    const isMouse = e.pointerType === 'mouse';
    const startX = e.clientX;
    const startY = e.clientY;
    const t0 = performance.now();
    drag.current = { startX, startLeft: el.scrollLeft, moved: false, active: true };
    const from = Math.round(el.scrollLeft / (el.clientWidth + gap));
    let decided = false; // 가로/세로 판정 끝
    const cleanup = () => {
      drag.current.active = false;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };
    const onMove = (ev: PointerEvent) => {
      if (!drag.current.active || ev.pointerId !== e.pointerId) return;
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!decided) {
        if (Math.abs(dx) <= 4 && Math.abs(dy) <= 4) return;
        decided = true;
        if (Math.abs(dy) > Math.abs(dx)) {
          // 세로 손짓 — 끌기 아님(페이지 세로 스크롤은 브라우저가 한다).
          cleanup();
          return;
        }
        drag.current.moved = true;
        el.style.scrollSnapType = 'none'; // 끄는 동안 스냅이 위치를 되돌리지 않게
      }
      if (drag.current.moved) el.scrollLeft = drag.current.startLeft - dx;
    };
    const settle = (dx: number, flickable: boolean) => {
      el.style.scrollSnapType = '';
      const dt = performance.now() - t0;
      const width = el.clientWidth || 1;
      const flick = flickable && dt < 300 && Math.abs(dx) > 5; // swiper shortSwipes(300ms) 대응
      const far = Math.abs(dx) > (isMouse ? 30 : width / 2); // 천천히 끈 경우 — 터치는 swiper longSwipesRatio 0.5
      goTo(flick || far ? from + (dx < 0 ? 1 : -1) : from);
    };
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      const dx = ev.clientX - startX;
      const wasDrag = drag.current.moved;
      cleanup();
      if (wasDrag) settle(dx, true);
      // click은 pointerup 직후 발생 — 캡처 억제가 소비한 뒤 다음 틱에 리셋.
      setTimeout(() => {
        drag.current.moved = false;
      }, 0);
    };
    const onCancel = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      const wasDrag = drag.current.moved;
      cleanup();
      drag.current.moved = false;
      // 브라우저가 손짓을 가져갔다 — 끌던 중이면 가장 가까운 장으로 맞춘다.
      if (wasDrag) {
        el.style.scrollSnapType = '';
        goTo(Math.round(el.scrollLeft / (el.clientWidth + gap)));
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
  };

  return (
    <div data-banner-carousel className={`relative ${className}`}>
      <div
        ref={trackRef}
        onPointerDown={onPointerDown}
        onClickCapture={(e) => {
          if (drag.current.moved) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
        onDragStart={(e) => e.preventDefault()}
        className="snap-track flex h-full w-full"
        // pan-y — 가로 손짓은 위 끌기 처리가 맡고(swiper와 같은 튕김 규칙), 세로 스크롤은 브라우저가 한다.
        style={gap ? { columnGap: gap, touchAction: 'pan-y' } : { touchAction: 'pan-y' }}
      >
        {slides.map((s, i) => (
          <div key={i} className={`snap-slide w-full shrink-0 ${slideClassName}`}>
            {s}
          </div>
        ))}
      </div>
      <div className="snap-dots">
        {slides.map((_, i) => (
          <span
            key={i}
            role="button"
            tabIndex={0}
            aria-label={`Go to slide ${i + 1}`}
            aria-current={i === active ? 'true' : undefined}
            className={i === active ? 'snap-dot snap-dot-active' : 'snap-dot'}
            onClick={() => goTo(i)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') goTo(i);
            }}
          />
        ))}
      </div>
    </div>
  );
}
