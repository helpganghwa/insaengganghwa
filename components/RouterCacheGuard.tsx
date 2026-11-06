'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { takeRouterCacheStale } from '@/lib/client/router-cache-stale';

/**
 * 뒤로/앞으로 가기 캐시 보정(2026-11-06 업데이트 18) — 강화 수령처럼 재렌더 없이 서버 상태를 바꾼 액션이
 * markRouterCacheStale()를 세워 두면, 그 뒤 **브라우저 기록 이동(popstate)으로 화면이 바뀐 직후** 한 번만 router.refresh한다.
 * router.refresh는 지금 화면을 새로 받고 라우터 캐시 전체를 비우므로 한 번이면 된다. Link 이동은 동적 페이지라 새로 받으므로
 * 건드리지 않는다. 팝업 닫기(같은 경로의 popstate)는 경로가 바뀌지 않아 대상이 아니다.
 */
export function RouterCacheGuard() {
  const pathname = usePathname();
  const router = useRouter();
  const popAtRef = useRef(0);
  const firstRef = useRef(true);
  useEffect(() => {
    const onPop = () => {
      popAtRef.current = Date.now();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  useEffect(() => {
    if (firstRef.current) {
      firstRef.current = false;
      return;
    }
    // 이 경로 변경이 기록 이동에서 왔을 때만(2초 안의 popstate).
    if (Date.now() - popAtRef.current > 2_000) return;
    if (takeRouterCacheStale()) router.refresh();
  }, [pathname, router]);
  return null;
}
