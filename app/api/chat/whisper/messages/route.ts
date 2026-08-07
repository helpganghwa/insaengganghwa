import { NextResponse } from 'next/server';

import { getSessionUserId } from '@/lib/auth/session';
import { getActiveServerId } from '@/lib/game/servers';
import { memoryRateLimited } from '@/lib/memory-ratelimit';
import { displayFields } from '@/lib/game/chat/service';
import { isUserIdShape, listWhisperMessages, whisperDisplay } from '@/lib/game/chat/whisper';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 한 대화의 메시지(0155) — GET /api/chat/whisper/messages?peer=<uuid>&before=<id>.
 * before는 위로 더 불러오기(커서). 내가 나간 지점 이하와 숨김 메시지는 코어가 제외한다.
 */
export async function GET(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  // 조회 리밋(인메모리) — 대화 열기 + 위로 더 불러오기 기준 분당 40이면 실사용엔 안 걸린다.
  if (memoryRateLimited(`whisperMessages:${userId}`, 40, 60_000)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }
  const url = new URL(req.url);
  const peer = (url.searchParams.get('peer') ?? '').trim().toLowerCase();
  if (!isUserIdShape(peer)) return NextResponse.json({ error: 'bad_request' }, { status: 400 });

  const beforeRaw = url.searchParams.get('before');
  let beforeId: bigint | undefined;
  if (beforeRaw) {
    // 18자리 상한 — 19자리는 int8 최댓값을 넘길 수 있고, 그러면 bigint 캐스트가 던져 500이 된다.
    if (!/^\d{1,18}$/.test(beforeRaw)) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    beforeId = BigInt(beforeRaw);
  }

  const serverId = await getActiveServerId();
  // 상대와 나를 **한 번의 displayFields**로 — 스레드가 전체 채팅과 같은 행(아바타·길드 문양·
  // 길드명·칭호)을 그리려면 내 표시 필드도 필요하다. 두 명을 따로 부르면 왕복만 늘어난다.
  const [messages, fields] = await Promise.all([
    listWhisperMessages(userId, serverId, peer, beforeId),
    displayFields([userId, peer], serverId),
  ]);
  return NextResponse.json({
    messages,
    // 상대가 이 서버에 캐릭터가 없어도(서버 이전·탈퇴) 대화 자체는 열람 가능 — 닉만 폴백.
    peer: { userId: peer, ...whisperDisplay(fields.get(peer)) },
    self: { userId, ...whisperDisplay(fields.get(userId)) },
  });
}
