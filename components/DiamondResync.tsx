'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

import { getDiamondBalanceAction } from '@/app/(game)/diamond-actions';
import { useDiamondActions } from '@/components/DiamondContext';

/**
 * 헤더 잔액 동기화(2026-08-22) — 세 트리거에서 서버 잔액으로 setBase:
 *  ① 앱/탭 복귀(visible 전환) ② PC 창 간 포커스 전환 ③ 페이지 이동(pathname 변경 —
 *     레이아웃이 유지되어 내비게이션으로는 재조회가 없던 것 보완, 사용자 요청).
 * 전역 router.refresh(RefreshOnResume)와 달리 잔액 1쿼리만 — 레이아웃 전체 재조회 부하 없음.
 * 3초 스로틀(연타·연속 이동 흡수). 진행 중인 낙관 조정과의 레이스는 다음 트리거/액션 응답이 수렴.
 */
export function DiamondResync() {
  const { setBase } = useDiamondActions();
  const pathname = usePathname();
  const lastRef = useRef(0);
  const sync = () => {
    if (document.visibilityState !== 'visible') return;
    const now = Date.now();
    if (now - lastRef.current < 3_000) return;
    lastRef.current = now;
    void getDiamondBalanceAction()
      .then((d) => {
        if (d !== null) setBase(BigInt(d));
      })
      .catch(() => {}); // 실패는 침묵 — 다음 트리거 때 재시도
  };
  useEffect(() => {
    document.addEventListener('visibilitychange', sync);
    // 나란히 띄운 PC 창은 포커스만 오가고 visible 전환이 없다 — focus로도 동기화(같은 스로틀).
    window.addEventListener('focus', sync);
    return () => {
      document.removeEventListener('visibilitychange', sync);
      window.removeEventListener('focus', sync);
    };
    // sync는 ref 기반이라 안정 — 등록은 1회.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // 페이지 이동 — 소프트 내비게이션마다(스로틀 공유).
  useEffect(() => {
    sync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);
  return null;
}
