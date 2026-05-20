'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

import { atlasBgStyle, ATLAS_CODES } from '@/lib/game/equipment/sprite-atlas';

const CYCLE_MS = 200; // grow식 — 표시 동안 여러 이미지 랜덤 순환 주기
const SAFETY_MS = 8000; // 멈춤 방지 자동 해제

function pick(prev?: string | null): string | null {
  return ATLAS_CODES[Math.floor(Math.random() * ATLAS_CODES.length)] ?? prev ?? null;
}

/**
 * grow식 화면 이동 로딩 — **이전 페이지를 그대로 둔 채 그 위 투명 오버레이**로
 * 아이템 이미지만(텍스트·배경 없음). 표시 동안 풀에서 **여러 이미지가 랜덤 순환**.
 * App Router는 라우터 이벤트가 없어 표준 기법(toploader류)으로 내부 링크 클릭 +
 * history.pushState를 가로채 표시하고 `usePathname` 변경(새 라우트 커밋) 시 해제.
 * sprite는 atlas(public/sprites/atlas.webp) 1장에서 background-position으로 잘라
 * 그림 — SpritePreloader가 atlas 1회 prefetch → 순환 교체 즉시.
 */
export function RouteTransitionOverlay() {
  const pathname = usePathname();
  const [active, setActive] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const safety = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stop = useCallback(() => {
    setActive(false);
    if (safety.current) clearTimeout(safety.current);
  }, []);

  // 새 라우트 커밋 → 해제.
  useEffect(() => {
    stop();
  }, [pathname, stop]);

  // 표시 중 여러 이미지 랜덤 순환.
  useEffect(() => {
    if (!active) return;
    setCode((p) => pick(p));
    const id = setInterval(() => setCode((p) => pick(p)), CYCLE_MS);
    return () => clearInterval(id);
  }, [active]);

  useEffect(() => {
    const show = () => {
      setActive(true);
      if (safety.current) clearTimeout(safety.current);
      safety.current = setTimeout(() => setActive(false), SAFETY_MS);
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
      if (safety.current) clearTimeout(safety.current);
    };
  }, []);

  if (!active || !code) return null;
  const bg = atlasBgStyle(code, 72);
  if (!bg) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[200] flex items-center justify-center">
      <div aria-hidden style={bg} />
    </div>
  );
}
