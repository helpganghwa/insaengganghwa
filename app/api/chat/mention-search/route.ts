import { NextResponse } from 'next/server';
import { and, ilike, ne, eq } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { getActiveServerId } from '@/lib/game/servers';
import { db } from '@/lib/db/client';
import { characters } from '@/lib/db/schema/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 멘션 자동완성 — 서버 전체 닉네임 prefix 검색(0128).
 * 세션 필수·본인 제외·limit 5. 클라 250ms 디바운스와 함께 사용(타이핑당 최대 1회).
 */
export async function GET(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const q = new URL(req.url).searchParams.get('q')?.trim() ?? '';
  if (q.length < 1 || q.length > 12) return NextResponse.json({ nicknames: [] });
  const serverId = await getActiveServerId();
  const rows = await db
    .select({ nickname: characters.nickname })
    .from(characters)
    .where(
      and(
        eq(characters.serverId, serverId),
        ne(characters.userId, userId),
        // prefix 검색 — %는 이스케이프(닉네임 정책상 특수문자 없음이지만 방어).
        ilike(characters.nickname, `${q.replaceAll('%', '\\%').replaceAll('_', '\\_')}%`),
      ),
    )
    .orderBy(characters.nickname)
    .limit(5);
  return NextResponse.json({ nicknames: rows.map((r) => r.nickname) });
}
