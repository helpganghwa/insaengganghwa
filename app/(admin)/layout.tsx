import { notFound, redirect } from 'next/navigation';

import { getAdminStatus } from '@/lib/auth/require-admin';
import { AdminBack } from './AdminBack';

/**
 * 어드민 라우트 그룹 게이트 — 모든 /admin/* 페이지 공통.
 * 미로그인 → /login, 로그인했지만 비관리자 → notFound(404, 존재 노출 회피).
 * 레이아웃이 await 후 통과해야 children(페이지)이 렌더되므로 페이지별 가드 불필요.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { userId, isAdmin } = await getAdminStatus();
  if (!userId) redirect('/login');
  if (!isAdmin) notFound();
  return (
    <>
      <AdminBack />
      {children}
    </>
  );
}
