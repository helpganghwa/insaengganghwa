'use client';

import { useEffect } from 'react';

import { markClientChallengeAction } from '@/app/(game)/challenges/actions';

/**
 * 앱 실행 감지 — PWA(standalone)로 실행 중이면 도전 과제 'app_install' 마킹(0118).
 * 억제 플래그(chg_app_marked)는 **성공한 날짜**를 저장하고 같은 날만 스킵한다(2026-08-24) —
 * 종전 영구 플래그('1')는 컷오버 wipe·계정 리셋 후에도 남아, CBT 때 마킹했던 기기가
 * 정식 오픈에서 영원히 재마킹을 스킵했다(오픈일 제보). 서버 마킹은 멱등이라 일 1회 재시도 무해.
 * 네트워크 실패 시 저장하지 않아 다음 standalone 실행에서 재시도(false-negative 방지 유지).
 */
export function AppInstallMark() {
  useEffect(() => {
    void (async () => {
      try {
        const kstDay = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
        if (localStorage.getItem('chg_app_marked') === kstDay) return;
        const standalone =
          window.matchMedia?.('(display-mode: standalone)').matches ||
          (navigator as { standalone?: boolean }).standalone === true; // iOS Safari
        if (!standalone) return;
        const ok = await markClientChallengeAction('app_install');
        if (ok) localStorage.setItem('chg_app_marked', kstDay); // 성공 시에만 — 실패면 재시도
      } catch {
        /* noop — 다음 standalone 실행에서 재시도 */
      }
    })();
  }, []);
  return null;
}
