'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';

import { requireAdmin } from '@/lib/auth/require-admin';
import { db } from '@/lib/db/client';
import { clientErrors } from '@/lib/db/schema/ops';

/** 클라 에러 그룹 해결 처리(같은 fingerprint 재발 시 새 그룹 생성). */
export async function resolveClientErrorAction(id: string) {
  await requireAdmin();
  let bid: bigint;
  try {
    bid = BigInt(id);
  } catch {
    return { status: 'error', code: 'BAD_ID' } as const;
  }
  await db.update(clientErrors).set({ resolved: true }).where(eq(clientErrors.id, bid));
  revalidatePath('/admin/client-errors');
  return { status: 'success' } as const;
}
