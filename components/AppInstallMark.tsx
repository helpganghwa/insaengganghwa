'use client';

import { useEffect } from 'react';

import { markClientChallengeAction } from '@/app/(game)/challenges/actions';

/**
 * 앱 실행 감지 — PWA(standalone)로 실행 중이면 도전 과제 'app_install' 마킹(0118).
 * 1회성·멱등이라 세션당 한 번만 fire-and-forget(localStorage로 재호출 억제).
 */
export function AppInstallMark() {
  useEffect(() => {
    try {
      if (localStorage.getItem('chg_app_marked')) return;
      const standalone =
        window.matchMedia?.('(display-mode: standalone)').matches ||
        (navigator as { standalone?: boolean }).standalone === true; // iOS Safari
      if (!standalone) return;
      localStorage.setItem('chg_app_marked', '1');
      void markClientChallengeAction('app_install');
    } catch {
      /* noop */
    }
  }, []);
  return null;
}
