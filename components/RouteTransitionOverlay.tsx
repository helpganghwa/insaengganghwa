'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

import { atlasBgStyle, ATLAS_CODES } from '@/lib/game/equipment/sprite-atlas';

const CYCLE_MS = 200; // grow식 — 표시 동안 여러 이미지 랜덤 순환 주기
const SAFETY_MS = 4000; // 멈춤 방지 자동 해제
// 뒤로/앞으로는 같은 라우트로 가거나 bfcache 복원이라 pathname이 안 바뀔 수 있음 → 짧게 자동 해제.
const POP_SAFETY_MS = 1500;

function pick(prev?: string | null): string | null {
  return ATLAS_CODES[Math.floor(Math.random() * ATLAS_CODES.length)] ?? prev ?? null;
}

/**
 * history.pushState 후킹 — **모듈 스코프에서 딱 한 번 설치하고 절대 되돌리지 않는다.**
 *
 * ⚠ 되돌리면 안 되는 이유(2026-07-31 실서버 버그): Next도 useSearchParams 동기화를 위해
 * pushState를 감싼다. 예전 구현은 effect에서 원본을 캡처해 감싸고 **cleanup에서 그 원본을
 * 복원**했는데, 이 컴포넌트는 (game) 레이아웃에만 있어 /admin·/u 등 다른 라우트 그룹으로
 * 나가면 언마운트된다. 그때 복원되는 '원본'은 Next가 패치하기 전의 네이티브 함수라
 * (자식 effect가 Next의 AppRouter effect보다 먼저 도는 순서 때문) **Next의 패치가 통째로
 * 사라진다**. 이후 window.history.pushState는 주소만 바꾸고 라우터에 알리지 않아
 * useSearchParams가 영원히 멈춘다 → 대난투 '전체 전투/내 전투' 탭이 눌러도 안 바뀌는
 * 증상(앱을 껐다 켜야 복구). 설치를 1회로 고정하면 이 되돌림 자체가 없어진다.
 *
 * replaceState는 감싸지 않는다 — 표시할 일이 없는데 감쌌다가 같은 방식으로 Next 패치를
 * 날리던 코드였다.
 */
let hookInstalled = false;
/** 현재 마운트된 오버레이의 표시 콜백(없으면 후크는 통과만 한다). */
let onProgrammaticNav: (() => void) | null = null;

function installHistoryHook(): void {
  if (hookInstalled || typeof window === 'undefined') return;
  hookInstalled = true;
  const origPush = window.history.pushState.bind(window.history);
  window.history.pushState = function patchedPushState(
    ...args: Parameters<typeof origPush>
  ): void {
    onProgrammaticNav?.();
    return origPush(...args);
  };
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
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString(); // ?tab=sum 변화도 감지(같은 pathname).
  const [active, setActive] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const safety = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stop = useCallback(() => {
    setActive(false);
    if (safety.current) clearTimeout(safety.current);
  }, []);

  // 새 라우트(경로 또는 쿼리스트링) 커밋 → 해제. /leaderboard?tab=sum 같이 pathname
  // 동일·query만 변화하는 탭 전환도 해제 트리거(이전: pathname만 deps라 멈춤).
  useEffect(() => {
    stop();
  }, [pathname, searchKey, stop]);

  // 표시 중 여러 이미지 랜덤 순환.
  useEffect(() => {
    if (!active) return;
    setCode((p) => pick(p));
    const id = setInterval(() => setCode((p) => pick(p)), CYCLE_MS);
    return () => clearInterval(id);
  }, [active]);

  useEffect(() => {
    const show = (safetyMs = SAFETY_MS) => {
      setActive(true);
      if (safety.current) clearTimeout(safety.current);
      safety.current = setTimeout(() => setActive(false), safetyMs);
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

    // 후크는 모듈 스코프에 1회만 설치하고, 여기서는 표시 콜백만 꽂았다 뺀다(위 주석 참조).
    installHistoryHook();
    onProgrammaticNav = () => show();
    // 뒤로/앞으로 — 같은 라우트일 수 있어 짧은 안전타이머로(무한 표시 방지).
    const onPop = () => show(POP_SAFETY_MS);
    window.addEventListener('popstate', onPop);
    // bfcache 복원(뒤로/앞으로) 시 잔류 오버레이 강제 해제.
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) stop();
    };
    window.addEventListener('pageshow', onPageShow);

    return () => {
      document.removeEventListener('click', onClick, true);
      onProgrammaticNav = null; // 후크는 남기고 콜백만 해제 — 언마운트 후 setState 방지.
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('pageshow', onPageShow);
      if (safety.current) clearTimeout(safety.current);
    };
  }, [stop]);

  if (!active || !code) return null;
  const bg = atlasBgStyle(code, 72);
  if (!bg) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[200] flex items-center justify-center">
      <div aria-hidden style={bg} />
    </div>
  );
}
