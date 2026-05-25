'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { profiles } from '@/lib/db/schema/profiles';
import { recordOperatorNotice } from '@/lib/game/world-history/record';

export async function publishNoticeAction(
  message: string,
): Promise<{ ok: true } | { ok: false; message?: string }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, message: 'UNAUTH' };
  const [p] = await db
    .select({ isAdmin: profiles.isAdmin })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);
  if (!p?.isAdmin) return { ok: false, message: 'FORBIDDEN' };

  const trimmed = message.trim();
  if (trimmed.length === 0 || trimmed.length > 280) {
    return { ok: false, message: '1~280자 사이' };
  }
  await recordOperatorNotice(trimmed);
  revalidatePath('/admin/world-notice');
  revalidatePath('/');
  revalidatePath('/history');
  return { ok: true };
}
