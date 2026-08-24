'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { useDiamondActions, useDiamondValue } from '@/components/DiamondContext';

/**
 * 헤더 다이아 표시 — useDiamond로 context 값 구독.
 * 보석 시간 단축 등 클라이언트 액션이 optimisticAdjust(-cost)로 즉시 차감 → 헤더 표시 즉시 갱신.
 * router.refresh() 후 DiamondInitializer가 setBase로 서버 정확값 sync.
 *
 * ssr = AppHeader(server)가 준 잔액 스냅샷. 마운트 전에는 무조건 이 값을 렌더한다 —
 * 서버 HTML과 첫 하이드레이션 렌더가 항상 일치(#418 방지, 2026-08-24 오픈일 x55 원인).
 * 이 컴포넌트는 스트리밍 Suspense 경계 안이라 하이드레이션이 지연될 수 있고, 그 사이
 * 경계 밖 DiamondResync가 setBase를 커밋하면 하이드레이션 렌더의 컨텍스트 읽기가
 * 초기값(0)/갱신값 중 무엇을 주는지 타이밍에 따라 갈렸다(로컬 재현으로 양방향 모두 실측).
 * 컨텍스트를 읽는 한 안전할 수 없으므로 mounted 게이트로 첫 렌더를 ssr에 고정한다.
 * get()===null 폴백은 mounted 후에도 setBase 미도착(이론상 창)이면 ssr 유지용.
 */
export function HeaderDiamond({ ssr }: { ssr: bigint }) {
  const live = useDiamondValue();
  const { get } = useDiamondActions();
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- 하이드레이션 안전(마운트 후 1회 확정)
  useEffect(() => setMounted(true), []);
  const diamond = !mounted || get() === null ? ssr : live;
  return (
    <Link prefetch={false}
      href="/shop?tab=charge"
      aria-label={`다이아 ${diamond} · 충전`}
      className="inline-flex items-center gap-1 text-zinc-700 dark:text-zinc-100"
    >
      <span aria-hidden>💎</span>
      <span className="font-mono tabular-nums">{diamond.toLocaleString('ko-KR')}</span>
    </Link>
  );
}
