import { notFound, redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { profiles } from '@/lib/db/schema/profiles';

import { AdminMailClient } from './AdminMailClient';

/**
 * 어드민 우편 발송 — 단건 + broadcast. is_admin true 인 계정만 진입.
 * 비-admin은 notFound() 로 처리(존재 노출 회피).
 */
export default async function AdminMailPage() {
  const userId = await getSessionUserId();
  if (!userId) redirect('/login'); // 미로그인 → 로그인으로(비관리자 로그인 사용자는 아래서 404)
  const [p] = await db
    .select({ isAdmin: profiles.isAdmin })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);
  if (!p?.isAdmin) notFound();
  return <AdminMailClient />;
}
