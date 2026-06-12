'use server';

import { revalidatePath } from 'next/cache';
import { getActiveServerId } from '@/lib/game/servers';

import { getSessionUserId } from '@/lib/auth/session';
import { finishTutorial, startTutorial } from '@/lib/game/tutorial';

/** 인트로 '시작하기' — 튜토리얼 활성화 후 레이아웃 갱신. */
export async function startTutorialAction() {
  const u = await getSessionUserId();
  if (!u) return { status: 'error' as const };
  await startTutorial(u, await getActiveServerId());
  revalidatePath('/', 'layout');
  return { status: 'success' as const };
}

/** 인트로 '건너뛰기'/완료 — DONE으로 마킹 후 레이아웃 갱신. */
export async function skipTutorialAction() {
  const u = await getSessionUserId();
  if (!u) return { status: 'error' as const };
  await finishTutorial(u, await getActiveServerId());
  revalidatePath('/', 'layout');
  return { status: 'success' as const };
}
