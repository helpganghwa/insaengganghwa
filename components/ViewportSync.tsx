'use client';

import { useEffect } from 'react';

/**
 * 큰 화면(폴드/태블릿) viewport 대응 — CSR 감지 → 쿠키 → 새로고침 시 SSR이 올바른
 * viewport 출력(generateViewport가 쿠키 읽음). 런타임 메타 변경은 크롬이 초기 스케일을
 * 잠가 안 먹히므로, 모드가 바뀔 때만 1회 reload로 SSR에서 확정.
 *
 * - 폰(<520): 쿠키 narrow → width=390(자동핏). 첫 방문에도 reload 없음(기본=narrow).
 * - 큰 화면(≥520): 쿠키 wide → device-width(정상 크기). 첫 방문/모드 변경 시 1회 reload.
 */
export function ViewportSync() {
  useEffect(() => {
    try {
      const w = Math.max(window.screen?.width || 0, window.innerWidth || 0);
      const want = w >= 520 ? 'wide' : 'narrow';
      const cur = (document.cookie.match(/(?:^|;\s*)vw=([^;]*)/) || [])[1];
      const rendered = cur || 'narrow'; // 쿠키 없으면 SSR 기본은 narrow(width=390)
      if (cur !== want) {
        document.cookie = `vw=${want}; path=/; max-age=31536000; samesite=lax`;
      }
      if (want !== rendered) window.location.reload();
    } catch {
      /* noop */
    }
  }, []);
  return null;
}
