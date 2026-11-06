'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * 한 장씩 넘기는 배너 캐러셀(2026-11-06 업데이트 18) — swiper(약 27KB gz)를 CSS scroll-snap + 점 표시로 대체.
 *
 * 홈 배너·상점 배너가 쓰던 swiper 설정(한 장씩·자동 넘김 없음·점 클릭 이동)과 같은 동작:
 *  - 터치: 네이티브 가로 스크롤 + `scroll-snap-type: x mandatory` + `scroll-snap-stop: always`(한 번에 한 장).
 *  - 마우스(PC): 잡아끌어 넘기기 — 끄는 동안만 스냅을 풀고, 놓으면 30px 넘게 끈 방향으로 한 장 이동(swiper의 마우스 드래그 대응).
 *    끌고 난 직후의 click은 삼켜 배너 링크 오클릭을 막는다.
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
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    const el = trackRef.current;
    if (!el) return;
    drag.current = { startX: e.clientX, startLeft: el.scrollLeft, moved: false, active: true };
    const from = Math.round(el.scrollLeft / (el.clientWidth + gap));
    const onMove = (ev: PointerEvent) => {
      if (!drag.current.active) return;
      const dx = ev.clientX - drag.current.startX;
      if (!drag.current.moved && Math.abs(dx) > 4) {
        drag.current.moved = true;
        el.style.scrollSnapType = 'none'; // 끄는 동안 스냅이 위치를 되돌리지 않게
      }
      if (drag.current.moved) el.scrollLeft = drag.current.startLeft - dx;
    };
    const onUp = (ev: PointerEvent) => {
      const dx = ev.clientX - drag.current.startX;
      drag.current.active = false;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (drag.current.moved) {
        el.style.scrollSnapType = '';
        goTo(Math.abs(dx) > 30 ? from + (dx < 0 ? 1 : -1) : from);
      }
      // click은 pointerup 직후 발생 — 캡처 억제가 소비한 뒤 다음 틱에 리셋.
      setTimeout(() => {
        drag.current.moved = false;
      }, 0);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
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
        style={gap ? { columnGap: gap } : undefined}
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
