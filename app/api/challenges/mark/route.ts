import { NextResponse } from 'next/server';

import { getSessionUserId } from '@/lib/auth/session';
import { getActiveServerId } from '@/lib/game/servers';
import { hasCharacterOn } from '@/lib/game/server-guard';
import { markChallengeEvent } from '@/lib/game/challenges/events';
import { db } from '@/lib/db/client';

/**
 * 클라 신고형 과제 마킹 — sendBeacon 전용(?e=<eventId>, 본문 없음).
 * 자랑 공유는 카카오 앱 전환이 서버 액션 fetch를 끊는 레이스가 있어(2026-07-15)
 * 전환에도 전송이 보장되는 beacon으로 마킹. 화이트리스트·멱등이라 위조 실익 없음.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const e = new URL(req.url).searchParams.get('e');
  if (e !== 'app_install' && e !== 'boast_share') return new NextResponse(null, { status: 204 });
  const userId = await getSessionUserId();
  if (!userId) return new NextResponse(null, { status: 204 });
  const serverId = await getActiveServerId();
  // 그 서버에 캐릭터가 있을 때만(11-16 검수 C7) — 위조 쿠키·닫힌 서버에 빈 행이 생기지 않게.
  if (!(await hasCharacterOn(userId, serverId))) return new NextResponse(null, { status: 204 });
  await markChallengeEvent(db, userId, serverId, e);
  return new NextResponse(null, { status: 204 });
}
