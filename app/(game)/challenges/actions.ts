'use server';

import { revalidatePath } from 'next/cache';

import { getSessionUserId, shouldHidePaidContent } from '@/lib/auth/session';
import { getActiveServerId } from '@/lib/game/servers';
import { rateLimited } from '@/lib/ratelimit';
import { actionBlock } from '@/lib/game/action-gate';
import { claimChallenge, claimAllChallenges } from '@/lib/game/challenges/claim';
import { markChallengeEvent } from '@/lib/game/challenges/events';
import { db } from '@/lib/db/client';

type ClaimResult =
  | { status: 'success'; diamond: number; boxes: { weapon: number; armor: number; accessory: number } | null }
  | { status: 'error'; message: string };

/** 과제 보상 수령 — 서버 권위 재검증 + 멱등(PK). */
export async function claimChallengeAction(challengeId: string): Promise<ClaimResult> {
  const userId = await getSessionUserId();
  if (!userId) return { status: 'error', message: '로그인이 필요합니다.' };
  const blocked = await actionBlock();
  if (blocked) return { status: 'error', message: '지금은 수령할 수 없습니다.' };
  if (await rateLimited(userId, 'challenge'))
    return { status: 'error', message: '잠시 후 다시 시도해 주세요.' };

  const serverId = await getActiveServerId();
  const r = await claimChallenge(userId, serverId, challengeId, await shouldHidePaidContent());
  if (!r.ok) {
    const msg =
      r.reason === 'NOT_DONE'
        ? '아직 달성하지 않은 과제예요.'
        : r.reason === 'ALREADY'
          ? '이미 받은 보상이에요.'
          : '알 수 없는 과제입니다.';
    return { status: 'error', message: msg };
  }
  revalidatePath('/challenges');
  revalidatePath('/');
  return { status: 'success', diamond: r.diamond, boxes: r.boxes };
}

type ClaimAllResult =
  | { status: 'success'; count: number; diamond: number; boxes: { weapon: number; armor: number; accessory: number } | null }
  | { status: 'error'; message: string };

/** 일괄 수령 — 달성 & 미수령 전 과제 단일 트랜잭션(완료 보너스 제외). */
export async function claimAllChallengesAction(): Promise<ClaimAllResult> {
  const userId = await getSessionUserId();
  if (!userId) return { status: 'error', message: '로그인이 필요합니다.' };
  const blocked = await actionBlock();
  if (blocked) return { status: 'error', message: '지금은 수령할 수 없습니다.' };
  if (await rateLimited(userId, 'challenge'))
    return { status: 'error', message: '잠시 후 다시 시도해 주세요.' };

  const serverId = await getActiveServerId();
  const r = await claimAllChallenges(userId, serverId, await shouldHidePaidContent());
  revalidatePath('/challenges');
  revalidatePath('/');
  return { status: 'success', ...r };
}

/**
 * 클라 신고형 달성 마킹 — 앱 실행(standalone 감지)·자랑 공유(공유 실행 시)만 허용.
 * 일회성 소액이라 위조 실익 없음(residence/avatar는 서버 액션 내부 마킹).
 */
export async function markClientChallengeAction(eventId: string): Promise<void> {
  if (eventId !== 'app_install' && eventId !== 'boast_share') return;
  const userId = await getSessionUserId();
  if (!userId) return;
  const serverId = await getActiveServerId();
  await markChallengeEvent(db, userId, serverId, eventId);
}
