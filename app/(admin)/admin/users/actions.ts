'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';

import { requireAdmin } from '@/lib/auth/require-admin';
import { db } from '@/lib/db/client';
import { profiles } from '@/lib/db/schema/profiles';
import { mailbox } from '@/lib/db/schema/mailbox';

type Result = { status: 'success' } | { status: 'error'; code: string };

/**
 * 유저 단위 제재 액션 — 신고 접수 없이도 선제 조치 가능(결제 어뷰징·매크로 등).
 * 신고 경유 제재는 /admin/reports가 담당(신고 정리 동반), 여긴 userId 직접 대상.
 */
export async function banUserAction(
  userId: string,
  reason: string,
  untilIso: string | null,
): Promise<Result> {
  await requireAdmin();
  if (!reason.trim()) return { status: 'error', code: 'NO_REASON' };
  let until: Date | null = null;
  if (untilIso) {
    // datetime-local('YYYY-MM-DDThh:mm', TZ 없음)을 KST로 해석.
    const d = new Date(`${untilIso}:00+09:00`);
    if (Number.isNaN(d.getTime())) return { status: 'error', code: 'BAD_UNTIL' };
    until = d;
  }
  const updated = await db
    .update(profiles)
    .set({ bannedAt: new Date(), banReason: reason.trim().slice(0, 500), banUntil: until })
    .where(eq(profiles.id, userId))
    .returning({ id: profiles.id });
  if (updated.length === 0) return { status: 'error', code: 'NOT_FOUND' };
  revalidatePath('/admin/users');
  return { status: 'success' };
}

export async function unbanUserAction(userId: string): Promise<Result> {
  await requireAdmin();
  const updated = await db
    .update(profiles)
    .set({ bannedAt: null, banReason: null, banUntil: null })
    .where(eq(profiles.id, userId))
    .returning({ id: profiles.id });
  if (updated.length === 0) return { status: 'error', code: 'NOT_FOUND' };
  revalidatePath('/admin/users');
  return { status: 'success' };
}

/** 경고 우편 — 유저의 활성 서버 우편함으로 발송. */
export async function warnUserAction(userId: string): Promise<Result> {
  await requireAdmin();
  const [p] = await db
    .select({ sid: profiles.lastServerId })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);
  if (!p) return { status: 'error', code: 'NOT_FOUND' };
  await db.insert(mailbox).values({
    userId,
    serverId: p.sid ?? 1,
    type: 'notice',
    title: '운영 경고',
    body: '운영정책 위반이 확인되었습니다. 반복 시 닉네임 초기화·아바타 변경·계정 정지로 이어질 수 있으니 유의해 주세요.',
    senderLabel: '운영팀',
    payload: {},
  });
  revalidatePath('/admin/users');
  return { status: 'success' };
}
