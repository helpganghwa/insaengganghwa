'use client';

import Link from 'next/link';

import { useDiamond } from '@/components/DiamondContext';

/**
 * 헤더 다이아 표시 — useDiamond로 context 값 구독.
 * 보석 단축 등 클라이언트 액션이 optimisticAdjust(-cost)로 즉시 차감 → 헤더 표시 즉시 갱신.
 * router.refresh() 후 DiamondInitializer가 setBase로 서버 정확값 sync.
 */
export function HeaderDiamond() {
  const { diamond } = useDiamond();
  return (
    <Link
      href="/shop?tab=charge"
      aria-label={`다이아 ${diamond} · 충전`}
      className="inline-flex items-center gap-1 text-zinc-700 dark:text-zinc-100"
    >
      <span aria-hidden>💎</span>
      <span className="font-mono tabular-nums">{diamond.toLocaleString('ko-KR')}</span>
    </Link>
  );
}
