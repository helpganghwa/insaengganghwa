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
 * 실시간 토픽은 **서버가 세션 검증을 마친 응답으로만 발급**한다(realtime.whisperTopic 주석) —
 * 여기와 /api/chat/recent(whisperChannel)가 같은 함수로 같은 값을 준다. 클라가 문자열을
 * 조립하면 남의 귓속말 토픽을 구독할 수 있어 그 방어가 무너진다.
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
