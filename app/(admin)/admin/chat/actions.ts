'use server';

import { revalidatePath } from 'next/cache';
import { eq, sql } from 'drizzle-orm';

import { requireAdmin } from '@/lib/auth/require-admin';
import { db } from '@/lib/db/client';
import { chatMessages, whisperMessages } from '@/lib/db/schema/chat';
import { adminActions } from '@/lib/db/schema/ops';
import { profiles } from '@/lib/db/schema/profiles';
import { broadcastChat } from '@/lib/game/chat/realtime';
import { invalidateRecentCache, resetChatEnabledCache } from '@/lib/game/chat/service';

type Result = { status: 'success' } | { status: 'error'; message: string };

/**
 * 검수 조치는 전부 admin_actions에 남긴다 — 유저가 이의를 제기하는 자리라 "누가·언제·왜"가
 * 없으면 답할 수 없다. 숨김/해제·금지/해제는 action 이름으로 갈라 로그만 보고도 구분되게 하고,
 * 제재 대상 유저는 target(제재) 또는 payload(숨김)에 담아 유저 기준 조회가 되게 한다.
 */

/** 메시지 숨김/해제 — 숨김 시 열려 있는 클라이언트에서도 제거(hide 브로드캐스트). */
export async function setChatHiddenAction(messageId: string, hidden: boolean): Promise<Result> {
  const adminUserId = await requireAdmin();
  const id = BigInt(messageId);
  const [row] = await db
    .update(chatMessages)
    .set({ hiddenAt: hidden ? new Date() : null })
    .where(eq(chatMessages.id, id))
    .returning({
      serverId: chatMessages.serverId,
      guildId: chatMessages.guildId,
      userId: chatMessages.userId,
    });
  if (!row) return { status: 'error', message: '메시지가 없습니다.' };
  await db.insert(adminActions).values({
    adminUserId,
    action: hidden ? 'chat.hide' : 'chat.unhide',
    targetType: 'chat_message',
    targetId: messageId,
    // guildId는 bigint — jsonb 직렬화가 BigInt에서 던지므로 문자열로.
    payload: { userId: row.userId, serverId: row.serverId, guildId: row.guildId?.toString() ?? null },
  });
  // 숨김·해제 모두 목록 캐시 무효화 — 해제는 브로드캐스트가 없어 다음 폴링이 복원 경로.
  invalidateRecentCache(row.serverId, row.guildId);
  if (hidden) await broadcastChat(row.serverId, 'hide', { id: messageId }, row.guildId);
  revalidatePath('/admin/chat');
  return { status: 'success' };
}

/**
 * 귓속말 숨김/해제 — hidden_at만 토글.
 * 전체·길드 채팅과 달리 브로드캐스트·캐시 무효화가 없다: 귓속말 조회는 목록 캐시 없이
 * 매번 DB를 읽고 `hidden_at is null`을 조회 시점에 거르므로, 다음 조회부터 자동 반영된다.
 */
export async function setWhisperHiddenAction(messageId: string, hidden: boolean): Promise<Result> {
  const adminUserId = await requireAdmin();
  const [row] = await db
    .update(whisperMessages)
    .set({ hiddenAt: hidden ? new Date() : null })
    .where(eq(whisperMessages.id, BigInt(messageId)))
    .returning({
      serverId: whisperMessages.serverId,
      fromUserId: whisperMessages.fromUserId,
      toUserId: whisperMessages.toUserId,
    });
  if (!row) return { status: 'error', message: '메시지가 없습니다.' };
  // 귓속말은 발신·수신 둘 다 남긴다 — 이의는 어느 쪽에서도 들어올 수 있다.
  await db.insert(adminActions).values({
    adminUserId,
    action: hidden ? 'whisper.hide' : 'whisper.unhide',
    targetType: 'whisper_message',
    targetId: messageId,
    payload: { userId: row.fromUserId, toUserId: row.toUserId, serverId: row.serverId },
  });
  revalidatePath('/admin/chat');
  return { status: 'success' };
}

/**
 * 채팅 금지 — days=0 해제, 36500=사실상 영구.
 * reason은 금지에만 받는다(해제는 되돌리는 행위라 마찰을 더할 이유가 없다).
 */
export async function muteChatUserAction(
  userId: string,
  days: number,
  reason?: string,
): Promise<Result> {
  const adminUserId = await requireAdmin();
  const until = days > 0 ? new Date(Date.now() + days * 86400_000) : null;
  const rows = await db
    .update(profiles)
    .set({ chatMutedUntil: until })
    .where(eq(profiles.id, userId))
    .returning({ id: profiles.id });
  if (rows.length === 0) return { status: 'error', message: '유저가 없습니다.' };
  await db.insert(adminActions).values({
    adminUserId,
    action: until ? 'chat.mute' : 'chat.unmute',
    targetType: 'user',
    targetId: userId,
    payload: { days, until: until?.toISOString() ?? null, reason: reason?.trim() || null },
  });
  revalidatePath('/admin/chat');
  return { status: 'success' };
}

/** 킬스위치 — system_mode key='chat': live=ON, maintenance=OFF. */
export async function setChatEnabledAction(enabled: boolean): Promise<Result> {
  const adminUserId = await requireAdmin();
  await db.execute(sql`
    insert into system_mode (key, mode, note)
    values ('chat', ${enabled ? 'live' : 'maintenance'}::system_mode_value, '월드 채팅 토글')
    on conflict (key) do update set mode = excluded.mode, updated_at = now()
  `);
  await db.insert(adminActions).values({
    adminUserId,
    action: enabled ? 'chat.enable' : 'chat.disable',
    targetType: 'system_mode',
    targetId: 'chat',
    payload: { enabled },
  });
  resetChatEnabledCache();
  revalidatePath('/admin/chat');
  return { status: 'success' };
}
