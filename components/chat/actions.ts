'use server';

import { getSessionUserId } from '@/lib/auth/session';
import { getActiveServerId } from '@/lib/game/servers';
import { rateLimited } from '@/lib/ratelimit';
import { reportChatMessage, setChatBlock } from '@/lib/game/chat/service';

/**
 * 월드 채팅 액션(0125) — 신고·차단(저빈도만). 전송은 POST /api/chat/send로 분리(2026-08-06) —
 * 서버 액션은 응답에 layout 재렌더가 동봉되어 최고 빈도 쓰기인 전송에 부적합(lib/game/chat/send.ts).
 */

/** 차단 설정/해제(0126, 계정 귀속) — 멱등. */
export async function setChatBlockAction(
  blockedUserId: string,
  on: boolean,
): Promise<{ status: 'ok' | 'error'; message?: string }> {
  const userId = await getSessionUserId();
  if (!userId) return { status: 'error', message: '로그인이 필요합니다.' };
  if (!/^[0-9a-f-]{36}$/i.test(blockedUserId) || blockedUserId === userId)
    return { status: 'error', message: '잘못된 요청입니다.' };
  const r = await setChatBlock(userId, blockedUserId, on);
  if (r === 'CAP') return { status: 'error', message: '차단은 최대 100명까지 가능합니다.' };
  return { status: 'ok' };
}

export async function reportChat(messageId: string): Promise<{ status: 'ok' | 'error'; message?: string }> {
  const userId = await getSessionUserId();
  if (!userId) return { status: 'error', message: '로그인이 필요합니다.' };
  if (await rateLimited(userId, 'report')) return { status: 'error', message: '잠시 후 다시 시도해 주세요.' };
  let id: bigint;
  try {
    id = BigInt(messageId);
  } catch {
    return { status: 'error', message: '잘못된 요청입니다.' };
  }
  const serverId = await getActiveServerId();
  const r = await reportChatMessage(userId, id, serverId);
  if (r === 'not_found') return { status: 'error', message: '메시지를 찾을 수 없습니다.' };
  return { status: 'ok' };
}
