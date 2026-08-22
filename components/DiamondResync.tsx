'use client';

import { useEffect, useRef } from 'react';

import { getDiamondBalanceAction } from '@/app/(game)/diamond-actions';
import { useDiamondActions } from '@/components/DiamondContext';

/**
 * 복귀 잔액 동기화(2026-08-22) — visible 전환 시 서버 잔액으로 setBase.
 * 전역 router.refresh(RefreshOnResume)와 달리 잔액 1쿼리만 — 레이아웃 전체 재조회 부하 없음.
 * 10초 스로틀(탭 전환 연타 방지). 진행 중인 낙관 조정과의 레이스는 다음 복귀/액션 응답이 수렴.
 */
export function DiamondResync() {
  const { setBase } = useDiamondActions();
  const lastRef = useRef(0);
  useEffect(() => {
    const sync = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastRef.current < 10_000) return;
      lastRef.current = now;
      void getDiamondBalanceAction()
        .then((d) => {
          if (d !== null) setBase(BigInt(d));
        })
        .catch(() => {}); // 실패는 침묵 — 다음 복귀 때 재시도
    };
    document.addEventListener('visibilitychange', sync);
    // 나란히 띄운 PC 창은 포커스만 오가고 visible 전환이 없다 — focus로도 동기화(같은 스로틀).
    window.addEventListener('focus', sync);
    return () => {
      document.removeEventListener('visibilitychange', sync);
      window.removeEventListener('focus', sync);
    };
    // setBase는 영구 안정 참조.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
