'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

/** 이만큼 이상 숨겨져 있다 돌아왔을 때만 재조회(2026-11-06 업데이트 18). */
const MIN_HIDDEN_MS = 60_000;

/**
 * 복귀 동기화 — 앱이 백그라운드에서 돌아올 때 서버 상태로 강제 재조회.
 *
 * 배경(2026-07-06 유령 등록 사건): iOS PWA가 절전/전환 중 서버 액션 전송이 유실되면
 * 낙관 UI(가짜 강화 카드)만 남아 "등록된 것처럼" 보이고, 다음 수동 새로고침 전까지
 * 화면과 서버가 어긋난다. 복귀 시 refresh 한 번으로 이 클래스의 불일치를 전부 해소.
 * 5초 스로틀 — 탭 전환 연타로 인한 중복 refresh 방지.
 *
 * 숨김 60초 이상일 때만(2026-11-06 업데이트 18) — 종전엔 focus·visibilitychange마다(5초 스로틀) 화면 전체를
 * 다시 그려, PC 창 전환이나 알림을 잠깐 보고 돌아오는 것만으로 페이지·레이아웃 쿼리가 통째로 돌았다.
 * 이제 화면이 실제로 가려진(hidden) 시각을 기억해 두고, 60초 이상 가려졌다 돌아온 첫 복귀에만 refresh한다.
 * 가려지지 않은 채 포커스만 오가는 경우(창 전환)는 재조회하지 않는다.
 */
export function RefreshOnResume() {
  const router = useRouter();
  const lastRef = useRef(0);
  /** 마지막으로 hidden이 된 시각 — null이면 이번 복귀는 가려진 적이 없다(포커스만 오감). */
  const hiddenAtRef = useRef<number | null>(null);
  useEffect(() => {
    const sync = () => {
      if (document.visibilityState === 'hidden') {
        if (hiddenAtRef.current == null) hiddenAtRef.current = Date.now();
        return;
      }
      if (document.visibilityState !== 'visible') return;
      const hiddenAt = hiddenAtRef.current;
      if (hiddenAt == null) return;
      const now = Date.now();
      hiddenAtRef.current = null;
      if (now - hiddenAt < MIN_HIDDEN_MS) return;
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
