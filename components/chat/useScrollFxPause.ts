'use client';

import { useCallback, useEffect, useRef } from 'react';

/**
 * 스크롤 중 칭호 fx 일시정지(2026-08-24) — 채팅 행 칭호 애니메이션을 전부 살리면서도
 * 스크롤 프레임과의 페인트 경합을 없애는 절충. 스크롤 이벤트 동안 목록 컨테이너에
 * .chat-scrolling을 붙여(title-fx.css) animation-play-state만 멈추고, 이벤트가 200ms
 * 끊기면 떼서 현재 프레임부터 재개한다. 직접 DOM classList 토글이라 React 리렌더 0 —
 * iOS 모멘텀 스크롤도 이벤트가 연속 발화해 감속 끝까지 멈춤이 유지된다.
 */
export function useScrollFxPause() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );
  return useCallback((el: HTMLElement | null) => {
    if (!el) return;
    if (!el.classList.contains('chat-scrolling')) el.classList.add('chat-scrolling');
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => el.classList.remove('chat-scrolling'), 200);
  }, []);
}
