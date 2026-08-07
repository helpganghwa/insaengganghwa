import { NextResponse } from 'next/server';

import { getSessionUserId } from '@/lib/auth/session';
import { getActiveServerId } from '@/lib/game/servers';
import { memoryRateLimited } from '@/lib/memory-ratelimit';
import { displayFields } from '@/lib/game/chat/service';
import { isUserIdShape, listWhisperMessages } from '@/lib/game/chat/whisper';

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
    if (!/^\d{1,19}$/.test(beforeRaw)) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    beforeId = BigInt(beforeRaw);
  }

  const serverId = await getActiveServerId();
  const [messages, fields] = await Promise.all([
    listWhisperMessages(userId, serverId, peer, beforeId),
    displayFields([peer], serverId),
  ]);
  const f = fields.get(peer);
  return NextResponse.json({
    messages,
    peer: {
      userId: peer,
      // 상대가 이 서버에 캐릭터가 없어도(서버 이전·탈퇴) 대화 자체는 열람 가능 — 닉만 폴백.
      nickname: f?.nickname ?? '유저',
      publicCode: f?.publicCode ?? null,
      avatar: f?.avatar ?? null,
      faceBox: f?.faceBox ?? null,
      guildName: f?.guildName ?? null,
    },
  });
}
