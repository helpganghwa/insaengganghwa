import { NextResponse } from 'next/server';

import { and, eq } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { withTimeout } from '@/lib/db/with-timeout';
import { meleeBattles } from '@/lib/db/schema/melee';
import { getActiveServerId } from '@/lib/game/servers';
import { kstDateString } from '@/lib/kst';
import { memoryRateLimited } from '@/lib/memory-ratelimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 대난투 발표 대기 상태(2026-11-06 업데이트 18) — 발표 전 화면(MeleeCountdown)의 폴링 전용.
 * 종전엔 09~10시 미발표 구간에 10~15초마다 router.refresh로 /melee 페이지 + 레이아웃을 통째로 다시 그렸다
 * (회차 수·역대 우승자까지). 이제 오늘 배틀 행의 존재·상태만 1쿼리로 돌려주고, 화면은 값이 바뀔 때만 refresh한다.
 * 결과 내용은 싣지 않는다 — 발표 전 비공개 원칙(결과 API의 status 게이트)과 같은 이유로 status·참가자 수만.
 * 날짜는 요청 시점의 KST 오늘(페이지의 battleDate와 같은 기준 — 자정 넘어 열어 둔 화면도 다음 날 행을 본다).
 */
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ status: 'error' }, { status: 401 });
  // 정상 폴링은 분당 4~6회 — 여유 있게 막는다.
  if (memoryRateLimited(`meleeStatus:${userId}`, 30, 60_000)) {
    return NextResponse.json({ status: 'error' }, { status: 429 });
  }
  const serverId = await getActiveServerId();
  try {
    const [b] = await withTimeout(
      db
        .select({ status: meleeBattles.status, participantCount: meleeBattles.participantCount })
        .from(meleeBattles)
        .where(and(eq(meleeBattles.serverId, serverId), eq(meleeBattles.battleDate, kstDateString())))
        .limit(1),
      3000,
      'melee.status',
    );
    return NextResponse.json(
      { status: 'ok', hasBattle: b != null, revealed: b?.status === 'revealed', participantCount: b?.participantCount ?? null },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return NextResponse.json({ status: 'error' }, { status: 503 });
  }
}
