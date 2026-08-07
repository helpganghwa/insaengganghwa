import { NextResponse } from 'next/server';

import { getSessionUserId } from '@/lib/auth/session';
import { getActiveServerId } from '@/lib/game/servers';
import { memoryRateLimited } from '@/lib/memory-ratelimit';
import { whisperTopic } from '@/lib/game/chat/realtime';
import { listWhisperThreads } from '@/lib/game/chat/whisper';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 귓속말 대화 목록(0155) — GET /api/chat/whisper/threads.
 * 실시간 토픽은 **여기서만 발급**한다(realtime.whisperTopic 주석) — 세션 검증을 통과한 응답으로만
 * 전달해 남의 귓속말 토픽 구독을 막는다. 클라가 문자열을 조립하면 그 방어가 무너진다.
 */
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  // 조회 리밋(인메모리) — 목록은 열기·탭 전환에서만 부르는 저빈도 경로.
  if (memoryRateLimited(`whisperThreads:${userId}`, 30, 60_000)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }
  const serverId = await getActiveServerId();
  const threads = await listWhisperThreads(userId, serverId);
  return NextResponse.json({ threads, topic: whisperTopic(serverId, userId) });
}
