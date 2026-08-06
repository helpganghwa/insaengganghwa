import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { getActiveServerId } from '@/lib/game/servers';
import { db } from '@/lib/db/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 내 길드 문양 생성 상태(2026-08-06) — GuildHome의 '만드는 중' 대기 폴링 전용 경량 조회.
 * 이전엔 5초마다 router.refresh()로 /guild 전체(6쿼리)+layout(7쿼리)을 재렌더했다(감사 P1).
 * 이 라우트는 1쿼리 — 클라는 확정(문양 생김/failed)됐을 때만 풀 refresh 1회를 쏜다.
 */
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const serverId = await getActiveServerId();
  const rows = await db.execute(sql`
    select g.emblem_url as url, g.emblem_status as status
    from guild_members gm join guilds g on g.id = gm.guild_id
    where gm.user_id = ${userId} and gm.server_id = ${serverId} limit 1
  `);
  const r = (rows as unknown as { url: string | null; status: string }[])[0];
  if (!r) return NextResponse.json({ url: null, status: 'none' });
  return NextResponse.json({ url: r.url, status: r.status });
}
