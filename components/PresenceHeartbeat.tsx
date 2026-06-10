'use client';

import { useEffect } from 'react';

import { heartbeatAction } from '@/app/(game)/presence-actions';

/**
 * 접속 하트비트(쿠키 게이트) — 인증 레이아웃에 1회 마운트.
 * 쿠키 `ls_hb`(max-age 120s)가 살아있으면 아무 것도 안 함(대부분 페이지 로드 = DB 접근 0).
 * 만료(2분 경과)했을 때만 쿠키 재설정 + heartbeatAction 1회 호출 → 유저당 ~2분 1회 write.
 * 탭 복귀(visibilitychange)에도 쿠키 만료 시 핑.
 */
const COOKIE = 'ls_hb';
const TTL = 120; // seconds (2분)

export function PresenceHeartbeat() {
  useEffect(() => {
    const ping = () => {
      const alive = document.cookie.split('; ').some((c) => c.startsWith(`${COOKIE}=`));
      if (alive) return;
      // 게이트 먼저 닫고(중복 핑 방지) 호출 — 접속표시는 best-effort라 실패 시 다음 만료 때 재시도.
      document.cookie = `${COOKIE}=1; max-age=${TTL}; path=/; samesite=lax`;
      void heartbeatAction();
    };
    ping();
    const onVis = () => {
      if (document.visibilityState === 'visible') ping();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);
  return null;
}
