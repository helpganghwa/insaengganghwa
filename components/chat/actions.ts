'use server';

import { getSessionUserId } from '@/lib/auth/session';
import { getActiveServerId } from '@/lib/game/servers';
import { rateLimited } from '@/lib/ratelimit';
import { deleteOwnChatMessage, reportChatMessage, setChatBlock } from '@/lib/game/chat/service';
import { deleteOwnWhisperMessage, reportWhisperMessage } from '@/lib/game/chat/whisper';

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

/**
 * 본인 메시지 삭제(0177) — 본문 탭(내 메시지) → 확인 팝업. 서버가 본인·서버·숨김 여부를 검증.
 * 레이트리밋 chatDelete(5초 1회) — 전송 쿨다운과 동일 리듬(클라 카운트다운과 짝).
 */
export async function deleteChat(messageId: string): Promise<{ status: 'ok' | 'error'; message?: string }> {
  const userId = await getSessionUserId();
  if (!userId) return { status: 'error', message: '로그인이 필요합니다.' };
  if (await rateLimited(userId, 'chatDelete')) return { status: 'error', message: '삭제는 5초에 한 번 가능합니다.' };
  let id: bigint;
  try {
    id = BigInt(messageId);
  } catch {
    return { status: 'error', message: '잘못된 요청입니다.' };
  }
  const serverId = await getActiveServerId();
  const r = await deleteOwnChatMessage(userId, id, serverId);
  if (r === 'not_found') return { status: 'error', message: '메시지를 찾을 수 없습니다.' };
  return { status: 'ok' };
}

/** 본인 귓속말 삭제(0177) — 양쪽 화면 자리표시. */
export async function deleteWhisper(messageId: string): Promise<{ status: 'ok' | 'error'; message?: string }> {
  const userId = await getSessionUserId();
  if (!userId) return { status: 'error', message: '로그인이 필요합니다.' };
  if (await rateLimited(userId, 'chatDelete')) return { status: 'error', message: '삭제는 5초에 한 번 가능합니다.' };
  let id: bigint;
  try {
    id = BigInt(messageId);
  } catch {
    return { status: 'error', message: '잘못된 요청입니다.' };
  }
  const r = await deleteOwnWhisperMessage(userId, id);
  if (r === 'not_found') return { status: 'error', message: '메시지를 찾을 수 없습니다.' };
  return { status: 'ok' };
}

/**
 * 귓속말 메시지 신고 — 전체 채팅과 같은 진입(본문 탭)·같은 응답 문구.
 * 별도 액션인 이유: 신고 테이블이 다르고(chat_reports는 FK가 chat_messages), 가시성 검증이
 * '같은 서버·같은 길드'가 아니라 '그 대화의 참가자'라 판정 자체가 다르다.
 */
export async function reportWhisper(
  messageId: string,
): Promise<{ status: 'ok' | 'error'; message?: string }> {
  const userId = await getSessionUserId();
  if (!userId) return { status: 'error', message: '로그인이 필요합니다.' };
  if (await rateLimited(userId, 'report')) return { status: 'error', message: '잠시 후 다시 시도해 주세요.' };
  let id: bigint;
  try {
    id = BigInt(messageId);
  } catch {
    return { status: 'error', message: '잘못된 요청입니다.' };
  }
  const r = await reportWhisperMessage(userId, id);
  if (r === 'not_found') return { status: 'error', message: '메시지를 찾을 수 없습니다.' };
  return { status: 'ok' };
}
