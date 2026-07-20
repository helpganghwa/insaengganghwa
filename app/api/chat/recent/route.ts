import { NextResponse } from 'next/server';

import { and, eq } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { getActiveServerId } from '@/lib/game/servers';
import { db } from '@/lib/db/client';
import { characters } from '@/lib/db/schema/server';
import { getChatBlocks, getMyGuildChannel, getRecentChat, isChatEnabled } from '@/lib/game/chat/service';
import { chatTopic } from '@/lib/game/chat/realtime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 최근 채팅 조회(0125) — ChatDock 초기 로드·폴링 폴백 공용.
 * GET /api/chat/recent?limit=1|100&channel=all|guild — 세션 필수(스크래핑 방지).
 * 길드 채널은 소속 검증 후에만 조회(미가입=길드 메시지 미노출). disabled면 UI가 도크 숨김.
 */
export async function GET(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await isChatEnabled())) return NextResponse.json({ disabled: true, messages: [] });
  const url = new URL(req.url);
  const limitRaw = Number(url.searchParams.get('limit'));
  const limit = Number.isInteger(limitRaw) && limitRaw >= 1 && limitRaw <= 100 ? limitRaw : 100;
  const channel = url.searchParams.get('channel') === 'guild' ? 'guild' : 'all';
  const serverId = await getActiveServerId();

  const [blocked, [meChar], guild] = await Promise.all([
    getChatBlocks(userId, serverId),
    db
      .select({ nickname: characters.nickname })
      .from(characters)
      .where(and(eq(characters.userId, userId), eq(characters.serverId, serverId)))
      .limit(1),
    getMyGuildChannel(userId, serverId),
  ]);

  const guildId = channel === 'guild' && guild ? BigInt(guild.guildId) : null;
  // 길드 탭인데 미가입 → 메시지 없이 가입 안내만(UI가 처리).
  const messages = channel === 'guild' && !guild ? [] : await getRecentChat(serverId, limit, guildId);

  return NextResponse.json({
    channel: chatTopic(serverId, guildId),
    me: userId,
    meNickname: meChar?.nickname ?? null,
    guild: guild ? { id: guild.guildId, name: guild.guildName } : null,
    messages,
    blocked,
  });
}
