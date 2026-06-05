'use server';

import { revalidatePath } from 'next/cache';

import { getSessionUserId } from '@/lib/auth/session';
import { finishTutorial } from '@/lib/game/tutorial';

/** 신규 튜토리얼 '건너뛰기' — 완료로 마킹 후 레이아웃 갱신. */
export async function skipTutorialAction() {
  const u = await getSessionUserId();
  if (!u) return { status: 'error' as const };
  await finishTutorial(u);
  revalidatePath('/', 'layout');
  return { status: 'success' as const };
}
