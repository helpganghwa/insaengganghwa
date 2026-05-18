'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { profiles } from '@/lib/db/schema/profiles';

/** 닉네임 변경 — UNIQUE 충돌 시 에러. (변경 횟수 제한 정책은 후속) */
export async function updateNickname(formData: FormData) {
  const userId = await getSessionUserId();
  if (!userId) return { status: 'error' as const, message: '로그인이 필요합니다.' };
  const raw = String(formData.get('nickname') ?? '').trim();
  if (raw.length < 2 || raw.length > 16) {
    return { status: 'error' as const, message: '닉네임은 2~16자입니다.' };
  }
  try {
    await db.update(profiles).set({ nickname: raw }).where(eq(profiles.id, userId));
    revalidatePath('/me');
    return { status: 'success' as const };
  } catch {
    return { status: 'error' as const, message: '이미 사용 중인 닉네임입니다.' };
  }
}
