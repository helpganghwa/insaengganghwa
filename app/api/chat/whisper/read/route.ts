import { NextResponse } from 'next/server';

import { getSessionUserId } from '@/lib/auth/session';
import { getActiveServerId } from '@/lib/game/servers';
import { memoryRateLimited } from '@/lib/memory-ratelimit';
import { isUserIdShape, leaveWhisper, markWhisperRead } from '@/lib/game/chat/whisper';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 읽음 처리 / 대화 나가기(0155) — POST /api/chat/whisper/read.
 *   { peerUserId, lastId }      → 읽음 포인터 전진(역행 금지·실제 최신 id로 상한)
 *   { peerUserId, leave: true } → 나가기(내 쪽만 숨김, 상대 기록·어드민 열람 유지)
 * 자원 변경이 없어 actionBlock 게이트는 두지 않는다(정지 계정이 읽음을 갱신해도 무해).
 */
export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (memoryRateLimited(`whisperRead:${userId}`, 60, 60_000)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  let peer = '';
  let leave = false;
  let lastId: bigint | null = null;
  try {
    const b = (await req.json()) as { peerUserId?: unknown; lastId?: unknown; leave?: unknown };
    peer = (typeof b.peerUserId === 'string' ? b.peerUserId : '').trim().toLowerCase();
    leave = b.leave === true;
    const raw = typeof b.lastId === 'string' || typeof b.lastId === 'number' ? String(b.lastId) : '';
    if (/^\d{1,18}$/.test(raw)) lastId = BigInt(raw);
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
  if (!isUserIdShape(peer)) return NextResponse.json({ error: 'bad_request' }, { status: 400 });

  const serverId = await getActiveServerId();
  if (leave) {
    await leaveWhisper(userId, serverId, peer);
    return NextResponse.json({ ok: true, left: true });
  }
  if (lastId === null) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  await markWhisperRead(userId, serverId, peer, lastId);
  return NextResponse.json({ ok: true });
}
