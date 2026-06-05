import 'server-only';

import { eq } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { profiles } from '@/lib/db/schema/profiles';

/**
 * 어드민 게이트 단일 진실 원천 — profiles.is_admin(수동 SQL로만 true) 검사.
 * 페이지/레이아웃은 getAdminStatus로 redirect vs notFound를 구분하고,
 * 서버 액션은 requireAdmin으로 throw 가드한다.
 */
export async function getAdminStatus(): Promise<{ userId: string | null; isAdmin: boolean }> {
  const userId = await getSessionUserId();
  if (!userId) return { userId: null, isAdmin: false };
  const [p] = await db
    .select({ isAdmin: profiles.isAdmin })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);
  return { userId, isAdmin: !!p?.isAdmin };
}

/** 서버 액션 가드 — 미인증 'UNAUTHENTICATED' / 비관리자 'FORBIDDEN' throw, 통과 시 userId 반환. */
export async function requireAdmin(): Promise<string> {
  const { userId, isAdmin } = await getAdminStatus();
  if (!userId) throw new Error('UNAUTHENTICATED');
  if (!isAdmin) throw new Error('FORBIDDEN');
  return userId;
}
