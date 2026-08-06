import { NextResponse } from 'next/server';

import { getSessionUserId } from '@/lib/auth/session';
import { getActiveServerId } from '@/lib/game/servers';
import { getMyProfileQueueInfo } from '@/lib/game/profile/queue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 아바타 생성 큐 상태(2026-08-06) — CreateProfileForm 대기 폴링 전용 경량 조회.
 * 이전엔 30초마다 router.refresh()로 /me/create+layout 전체를 재렌더했다(생성 ~10분 =
 * 세션당 ~20회, 감사 P1). 클라는 상태가 바뀌었을 때만 풀 refresh 1회를 쏜다.
 */
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const serverId = await getActiveServerId();
  const q = await getMyProfileQueueInfo(userId, serverId);
  return NextResponse.json({ status: q?.status ?? null });
}
