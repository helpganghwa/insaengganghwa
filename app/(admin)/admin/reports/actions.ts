'use server';

import { revalidatePath } from 'next/cache';
import { eq, sql } from 'drizzle-orm';

import { requireAdmin } from '@/lib/auth/require-admin';
import { db } from '@/lib/db/client';
import { userProfiles, profileReports } from '@/lib/db/schema/avatar';

/** 비공개 — hidden_at 설정. 자랑카드·hub·랭킹에서 fallback 처리됨. PROFILE §7.2 */
export async function hideProfile(profileId: string): Promise<void> {
  await requireAdmin();
  await db
    .update(userProfiles)
    .set({ hiddenAt: sql`now()` })
    .where(eq(userProfiles.id, profileId));
  revalidatePath('/admin/reports');
}

/** 복원 — hidden_at 해제. */
export async function unhideProfile(profileId: string): Promise<void> {
  await requireAdmin();
  await db
    .update(userProfiles)
    .set({ hiddenAt: null })
    .where(eq(userProfiles.id, profileId));
  revalidatePath('/admin/reports');
}

/** 기각 — 신고 무효 처리(신고 레코드 삭제 + count 0). 프로필은 공개 유지. */
export async function dismissReports(profileId: string): Promise<void> {
  await requireAdmin();
  await db.transaction(async (tx) => {
    await tx.delete(profileReports).where(eq(profileReports.profileId, profileId));
    await tx
      .update(userProfiles)
      .set({ reportCount: 0 })
      .where(eq(userProfiles.id, profileId));
  });
  revalidatePath('/admin/reports');
}
