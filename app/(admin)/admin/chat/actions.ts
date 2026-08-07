'use server';

import { revalidatePath } from 'next/cache';
import { eq, sql } from 'drizzle-orm';

import { requireAdmin } from '@/lib/auth/require-admin';
import { db } from '@/lib/db/client';
import { chatMessages, whisperMessages } from '@/lib/db/schema/chat';
import { profiles } from '@/lib/db/schema/profiles';
import { broadcastChat } from '@/lib/game/chat/realtime';
import { invalidateRecentCache, resetChatEnabledCache } from '@/lib/game/chat/service';

type Result = { status: 'success' } | { status: 'error'; message: string };

/** 메시지 숨김/해제 — 숨김 시 열려 있는 클라이언트에서도 제거(hide 브로드캐스트). */
export async function setChatHiddenAction(messageId: string, hidden: boolean): Promise<Result> {
  await requireAdmin();
  const id = BigInt(messageId);
  const [row] = await db
    .update(chatMessages)
    .set({ hiddenAt: hidden ? new Date() : null })
    .where(eq(chatMessages.id, id))
    .returning({ serverId: chatMessages.serverId, guildId: chatMessages.guildId });
  if (!row) return { status: 'error', message: '메시지가 없습니다.' };
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
  await requireAdmin();
  const rows = await db
    .update(whisperMessages)
    .set({ hiddenAt: hidden ? new Date() : null })
    .where(eq(whisperMessages.id, BigInt(messageId)))
    .returning({ id: whisperMessages.id });
  if (rows.length === 0) return { status: 'error', message: '메시지가 없습니다.' };
  revalidatePath('/admin/chat');
  return { status: 'success' };
}

/** 채팅 금지 — days=0 해제, 36500=사실상 영구. */
export async function muteChatUserAction(userId: string, days: number): Promise<Result> {
  await requireAdmin();
  const until = days > 0 ? new Date(Date.now() + days * 86400_000) : null;
  const rows = await db
    .update(profiles)
    .set({ chatMutedUntil: until })
    .where(eq(profiles.id, userId))
    .returning({ id: profiles.id });
  if (rows.length === 0) return { status: 'error', message: '유저가 없습니다.' };
  revalidatePath('/admin/chat');
  return { status: 'success' };
}

/** 킬스위치 — system_mode key='chat': live=ON, maintenance=OFF. */
export async function setChatEnabledAction(enabled: boolean): Promise<Result> {
  await requireAdmin();
  await db.execute(sql`
    insert into system_mode (key, mode, note)
    values ('chat', ${enabled ? 'live' : 'maintenance'}::system_mode_value, '월드 채팅 토글')
    on conflict (key) do update set mode = excluded.mode, updated_at = now()
  `);
  resetChatEnabledCache();
  revalidatePath('/admin/chat');
  return { status: 'success' };
}
