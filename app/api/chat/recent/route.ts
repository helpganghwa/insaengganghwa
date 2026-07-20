import { NextResponse } from 'next/server';

import { getSessionUserId } from '@/lib/auth/session';
import { getActiveServerId } from '@/lib/game/servers';
import { getChatBlocks, getRecentChat, isChatEnabled } from '@/lib/game/chat/service';
import { chatTopic } from '@/lib/game/chat/realtime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 최근 채팅 조회(0125) — ChatDock 초기 로드·폴링 폴백 공용.
 * GET /api/chat/recent?limit=1|100 — 세션 필수(스크래핑 방지). disabled면 UI가 도크 숨김.
 */
export async function GET(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await isChatEnabled())) return NextResponse.json({ disabled: true, messages: [] });
  const url = new URL(req.url);
  const limitRaw = Number(url.searchParams.get('limit'));
  const limit = Number.isInteger(limitRaw) && limitRaw >= 1 && limitRaw <= 100 ? limitRaw : 100;
  const serverId = await getActiveServerId();
  const [messages, blocked] = await Promise.all([
    getRecentChat(serverId, limit),
    getChatBlocks(userId, serverId),
  ]);
  return NextResponse.json({ channel: chatTopic(serverId), me: userId, messages, blocked });
}
