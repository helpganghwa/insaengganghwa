'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

import { LOADING_SPRITES } from '@/lib/game/equipment/loading-sprites';

/**
 * grow식 화면 이동 로딩 — **이전 페이지를 그대로 둔 채 그 위에 투명 오버레이**로
 * 아이템 이미지 1장만(텍스트·배경 없음). App Router는 라우터 이벤트가 없으므로
 * 표준 기법(toploader류)으로 내부 링크 클릭 + history.pushState를 가로채 표시하고,
 * `usePathname` 변경(=새 라우트 커밋) 시 해제. loading.tsx는 제거(폴백 교체 방지).
 *
 * - 배경 투명·pointer-events-none → 이전 화면이 비치고 입력도 막지 않음
 * - 풀은 SpritePreloader가 캐시 적재 → 즉시 표시(decoding=sync)
 * - 안전장치: 표시 후 8s 자동 해제(멈춤 방지)
 */
export function RouteTransitionOverlay() {
  const pathname = usePathname();
  const [src, setSrc] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 새 라우트 커밋(경로 변경) → 해제.
  useEffect(() => {
    setSrc(null);
    if (timer.current) clearTimeout(timer.current);
  }, [pathname]);

  useEffect(() => {
    const show = () => {
      setSrc(
        (prev) =>
          LOADING_SPRITES[Math.floor(Math.random() * LOADING_SPRITES.length)] ?? prev ?? null,
      );
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setSrc(null), 8000);
    };

    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
        return;
      const a = (e.target as Element | null)?.closest?.('a');
      if (!a) return;
      const href = a.getAttribute('href');
      if (!href || a.target === '_blank' || a.hasAttribute('download')) return;
      let url: URL;
      try {
        url = new URL(href, location.href);
      } catch {
        return;
      }
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      show();
    };
    document.addEventListener('click', onClick, true);

    // router.push/replace = history API → 가로채 표시.
    const origPush = history.pushState.bind(history);
    const origReplace = history.replaceState.bind(history);
    history.pushState = (...args: Parameters<typeof origPush>) => {
      show();
      return origPush(...args);
    };
    history.replaceState = (...args: Parameters<typeof origReplace>) => origReplace(...args);
    const onPop = () => show();
    window.addEventListener('popstate', onPop);

    return () => {
      document.removeEventListener('click', onClick, true);
      history.pushState = origPush;
      history.replaceState = origReplace;
      window.removeEventListener('popstate', onPop);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  if (!src) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[200] flex items-center justify-center">
      {/* eslint-disable-next-line @next/next/no-img-element -- 픽셀 스프라이트(next/image 부적합, 프로젝트 컨벤션) */}
      <img
        src={src}
        alt=""
        width={144}
        height={144}
        className="h-36 w-36 drop-shadow-[0_4px_16px_rgba(0,0,0,0.55)]"
        style={{ imageRendering: 'pixelated' }}
        decoding="sync"
      />
    </div>
  );
}
