'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

/**
 * 복귀 동기화 — 앱이 백그라운드에서 돌아올 때 서버 상태로 강제 재조회.
 *
 * 배경(2026-07-06 유령 등록 사건): iOS PWA가 절전/전환 중 서버 액션 전송이 유실되면
 * 낙관 UI(가짜 강화 카드)만 남아 "등록된 것처럼" 보이고, 다음 수동 새로고침 전까지
 * 화면과 서버가 어긋난다. 복귀 시 refresh 한 번으로 이 클래스의 불일치를 전부 해소.
 * 5초 스로틀 — 탭 전환 연타로 인한 중복 refresh 방지.
 */
export function RefreshOnResume() {
  const router = useRouter();
  const lastRef = useRef(0);
  useEffect(() => {
    const sync = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastRef.current < 5_000) return;
      lastRef.current = now;
      router.refresh();
    };
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('focus', sync);
    return () => {
      document.removeEventListener('visibilitychange', sync);
      window.removeEventListener('focus', sync);
    };
  }, [router]);
  return null;
}
