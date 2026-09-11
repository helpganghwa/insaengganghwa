'use client';

import { useEffect } from 'react';

import { APP_SESSION_KEY } from '@/lib/platform-client';

/**
 * 앱(TWA) 진입 표식을 이 브라우징 컨텍스트에 남긴다.
 *
 * proxy.ts가 `/?src=twa`를 `/#app`으로 리다이렉트하면 여기서 sessionStorage로 옮기고 해시를 지운다.
 * 쿠키(`ig_platform`)는 앱과 크롬이 저장소를 공유해 같은 기기의 브라우저 탭으로 새지만,
 * sessionStorage는 탭·앱마다 독립이라 새지 않는다. 결제 경로 안전망이 이 값을 쓴다
 * (lib/platform-client.ts usePlayBilling — 2026-09-11 전수조사).
 */
export function AppSessionMark() {
  useEffect(() => {
    if (window.location.hash !== '#app') return;
    try {
      window.sessionStorage.setItem(APP_SESSION_KEY, '1');
    } catch {
      // 프라이빗 모드 등 저장 불가 — 쿠키 경로가 그대로 받친다.
    }
    // 해시를 지워 주소와 공유 링크에 남지 않게 한다(히스토리 항목은 늘리지 않는다).
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }, []);
  return null;
}
