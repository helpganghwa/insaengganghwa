'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * 관리자 영역 뒤로가기 — 허브(/admin)에선 프로필(/me)로, 하위 페이지에선 허브(/admin)로.
 * 경로 기반이라 새로고침·딥링크에서도 일관(history.back 의존 X).
 */
export function AdminBack() {
  const pathname = usePathname();
  const atHub = pathname === '/admin';
  const href = atHub ? '/me' : '/admin';
  const label = atHub ? '← 프로필' : '← 관리자 메뉴';
  return (
    <div className="px-4 pt-4">
      <Link href={href} className="inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-amber-300">
        {label}
      </Link>
    </div>
  );
}
