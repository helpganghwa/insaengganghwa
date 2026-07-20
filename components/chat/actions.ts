'use server';

import { eq } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { getActiveServerId } from '@/lib/game/servers';
import { actionBlock } from '@/lib/game/action-gate';
import { rateLimited } from '@/lib/ratelimit';
import { db } from '@/lib/db/client';
import { profiles } from '@/lib/db/schema/profiles';
import { CHAT_MAX_LEN, checkAndFilterChatBody } from '@/lib/game/chat/filter';
import {
  isChatEnabled,
  isDuplicateOfLast,
  persistAndBroadcast,
  reportChatMessage,
  type ChatMessageDto,
} from '@/lib/game/chat/service';

/** 월드 채팅 액션(0125) — 전송·신고. 전송은 서버 검증 단일 경로. */

export type SendChatResult =
  | { status: 'ok'; message: ChatMessageDto }
  | { status: 'error'; message: string };

export async function sendChat(raw: string): Promise<SendChatResult> {
  const userId = await getSessionUserId();
  if (!userId) return { status: 'error', message: '로그인이 필요합니다.' };
  const __b = await actionBlock();
  if (__b) return { status: 'error', message: __b === 'BANNED' ? '이용이 제한된 계정입니다.' : '서버 점검 중입니다.' };
  if (!(await isChatEnabled())) return { status: 'error', message: '채팅이 잠시 닫혀 있습니다.' };

  // 채팅 금지(운영 제재) — 만료 지나면 자동 해제 간주.
  const [p] = await db
    .select({ mutedUntil: profiles.chatMutedUntil })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);
  if (p?.mutedUntil && p.mutedUntil > new Date())
    return { status: 'error', message: '채팅 이용이 제한된 상태입니다.' };

  if (await rateLimited(userId, 'chatSend'))
    return { status: 'error', message: '잠시 후 다시 보낼 수 있어요. (5초)' };
  if (await rateLimited(userId, 'chatBurst'))
    return { status: 'error', message: '메시지를 너무 자주 보내고 있어요. 잠시 쉬어주세요.' };

  const check = checkAndFilterChatBody(raw);
  if (!check.ok) {
    const msg =
      check.reason === 'URL'
        ? '링크는 보낼 수 없어요.'
        : check.reason === 'TOO_LONG'
          ? `${CHAT_MAX_LEN}자까지 보낼 수 있어요.`
          : '내용을 입력해 주세요.';
    return { status: 'error', message: msg };
  }

  const serverId = await getActiveServerId();
  if (await isDuplicateOfLast(userId, serverId, check.body))
    return { status: 'error', message: '같은 내용을 연속으로 보낼 수 없어요.' };

  const message = await persistAndBroadcast(userId, serverId, check.body);
  return { status: 'ok', message };
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
  const r = await reportChatMessage(userId, id);
  if (r === 'not_found') return { status: 'error', message: '메시지를 찾을 수 없습니다.' };
  return { status: 'ok' };
}
