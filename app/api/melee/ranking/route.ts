import { NextResponse } from 'next/server';

import { eq } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { meleeBattles } from '@/lib/db/schema/melee';
import { memoryRateLimited } from '@/lib/memory-ratelimit';
import { getMeleeRanking, type MeleeRankMode } from '@/lib/game/melee/ranking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 대난투 전체 순위 조회(2026-08-06) — 서버 액션(meleeRankingAction)에서 이전.
 * 호출부가 무한 스크롤·탭 전환이라, 액션이면 호출마다 /melee 페이지+layout 전체 재렌더
 * (~15쿼리)가 응답에 동봉됐다(전수 감사 P1 — 채팅 전송과 같은 사유의 분리).
 * 읽기 전용이라 액션 게이트(정지/점검) 불필요, 조회자 시점 고정(내 등수·내 길드)은 동일.
 */
export async function GET(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ status: 'error' }, { status: 401 });
  // 스크롤 페이징 어뷰징 방어 — 정상 스크롤은 분당 수 회.
  if (memoryRateLimited(`meleeRank:${userId}`, 60, 60_000)) {
    return NextResponse.json({ status: 'error' }, { status: 429 });
  }
  const q = new URL(req.url).searchParams;
  const battleIdRaw = q.get('battleId') ?? '';
  if (!/^\d+$/.test(battleIdRaw)) return NextResponse.json({ status: 'error' }, { status: 400 });
  const m = q.get('mode');
  const mode: MeleeRankMode = m === 'guild' ? 'guild' : m === 'friends' ? 'friends' : 'all';
  const num = (k: string) => {
    const v = Number(q.get(k));
    return Number.isInteger(v) && v > 0 ? v : undefined;
  };
  try {
    // 회차의 서버로 조회한다(2026-09-21 F6) — 결과 화면(SSR)은 `battle.serverId`로 첫 페이지를 그리는데
    // 이 API만 보는 사람의 활성 서버를 써서, 다른 서버 회차를 열면 첫 화면은 나오고 스크롤하면 끊겼다.
    // 발표 전 차단은 getMeleeRanking의 status 게이트가 그대로 맡는다.
    const [b] = await db
      .select({ serverId: meleeBattles.serverId })
      .from(meleeBattles)
      .where(eq(meleeBattles.id, BigInt(battleIdRaw)))
      .limit(1);
    if (!b) return NextResponse.json({ status: 'success', rows: [], myRank: null });
    const r = await getMeleeRanking({
      battleId: BigInt(battleIdRaw),
      serverId: b.serverId,
      viewerUserId: userId,
      mode,
      afterRank: num('after'),
      beforeRank: num('before'),
      aroundRank: num('around'),
    });
    return NextResponse.json({ status: 'success', ...r });
  } catch (e) {
    console.error('[melee.ranking]', e);
    return NextResponse.json({ status: 'error' }, { status: 500 });
  }
}
