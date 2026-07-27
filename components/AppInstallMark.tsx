'use client';

import { useEffect } from 'react';

import { markClientChallengeAction } from '@/app/(game)/challenges/actions';

/**
 * 앱 실행 감지 — PWA(standalone)로 실행 중이면 도전 과제 'app_install' 마킹(0118).
 * 억제 플래그(chg_app_marked)는 **마킹 성공 후에만** 저장 — 네트워크 실패 시 다음 standalone
 * 실행에서 재시도해 "설치했는데 못 받는" false-negative를 막는다(2026-07-27). 서버 마킹은 멱등.
 */
export function AppInstallMark() {
  useEffect(() => {
    void (async () => {
      try {
        if (localStorage.getItem('chg_app_marked')) return;
        const standalone =
          window.matchMedia?.('(display-mode: standalone)').matches ||
          (navigator as { standalone?: boolean }).standalone === true; // iOS Safari
        if (!standalone) return;
        const ok = await markClientChallengeAction('app_install');
        if (ok) localStorage.setItem('chg_app_marked', '1'); // 성공 시에만 억제 — 실패면 다음 실행 재시도
      } catch {
        /* noop — 다음 standalone 실행에서 재시도 */
      }
    })();
  }, []);
  return null;
}
