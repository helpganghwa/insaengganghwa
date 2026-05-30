'use server';

import { sql } from 'drizzle-orm';
import { eq, and } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { pushSubscriptions } from '@/lib/db/schema/push';
import { getSessionUserId } from '@/lib/auth/session';

/**
 * 클라이언트 측 PushManager.subscribe 결과를 백엔드에 등록.
 *
 * 멱등: endpoint UNIQUE라 ON CONFLICT (endpoint) DO UPDATE — 같은 디바이스에서
 * 재구독해도 1행 유지(키 갱신 가능). 다른 유저로 재로그인 시 user_id도 갱신.
 */
export async function registerPushSubscriptionAction(input: {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
}): Promise<{ ok: boolean }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false };
  if (!input.endpoint || !input.p256dh || !input.auth) return { ok: false };

  await db
    .insert(pushSubscriptions)
    .values({
      userId,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      userAgent: input.userAgent ?? null,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: {
        userId,
        p256dh: input.p256dh,
        auth: input.auth,
        userAgent: input.userAgent ?? null,
        updatedAt: sql`now()`,
      },
    });
  return { ok: true };
}

/** 디바이스 1개 구독 해제(설정 페이지에서 호출). endpoint로 식별. */
export async function unregisterPushSubscriptionAction(input: {
  endpoint: string;
}): Promise<{ ok: boolean }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false };
  await db
    .delete(pushSubscriptions)
    .where(
      and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, input.endpoint)),
    );
  return { ok: true };
}

/** 카테고리 토글 갱신 — profiles.push_{enhance,raid,supply} 컬럼. */
export async function setPushCategoryAction(input: {
  category: 'enhance' | 'raid' | 'supply';
  enabled: boolean;
}): Promise<{ ok: boolean }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false };
  const col =
    input.category === 'enhance'
      ? 'push_enhance'
      : input.category === 'raid'
        ? 'push_raid'
        : 'push_supply';
  // 컬럼 식별자는 enum이라 SQL injection 위험 없음.
  await db.execute(
    sql`update profiles set ${sql.raw(col)} = ${input.enabled}, updated_at = now() where id = ${userId}::uuid`,
  );
  return { ok: true };
}

/** 강화 알림 모드 갱신 — instant(즉시) | batched(30분 묶음) | batched_1h(1시간 묶음). */
export async function setPushEnhanceModeAction(input: {
  mode: 'instant' | 'batched' | 'batched_1h';
}): Promise<{ ok: boolean }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false };
  if (input.mode !== 'instant' && input.mode !== 'batched' && input.mode !== 'batched_1h')
    return { ok: false };
  await db.execute(
    sql`update profiles set push_enhance_mode = ${input.mode}::push_enhance_mode, updated_at = now() where id = ${userId}::uuid`,
  );
  return { ok: true };
}
