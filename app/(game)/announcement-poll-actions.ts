'use server';

import { getSessionUserId } from '@/lib/auth/session';
import { castPollVote } from '@/lib/game/announcement';

/**
 * 공지 투표(1인 1표, 변경 가능) — 게임 AnnouncementBoard에서 호출.
 * 결과·집계는 반환하지 않는다(유저 비노출 — 관리자만 열람).
 */
export async function votePollAction(input: {
  announcementId: string;
  optionId: string;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, reason: 'AUTH' };
  let annId: bigint;
  try {
    annId = BigInt(input.announcementId);
  } catch {
    return { ok: false, reason: 'BAD_ID' };
  }
  return castPollVote(userId, annId, input.optionId);
}
