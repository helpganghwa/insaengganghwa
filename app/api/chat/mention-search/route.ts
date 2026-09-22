import { NextResponse } from 'next/server';
import { and, ne, eq, sql } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { memoryRateLimited } from '@/lib/memory-ratelimit';
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
  // 조회 리밋(인메모리) — 250ms 디바운스 기준 정상 타이핑은 분당 수 회, 40이면 스크래핑만 걸린다.
  if (memoryRateLimited(`chatMention:${userId}`, 40, 60_000)) {
    return NextResponse.json({ nicknames: [] }, { status: 429 });
  }
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
        // 요청자도 그 서버 사람이어야 한다(2026-09-21 ⑱) — srv 쿠키는 검증 없이 활성 서버가
        // 되므로, 쿠키만 바꾸면 남의 서버 닉네임을 훑을 수 있었다. 같은 문장에 편승(왕복 0).
        sql`exists (select 1 from characters me where me.user_id = ${userId}::uuid and me.server_id = ${serverId})`,
        // prefix 검색 — characters_nick_prefix_idx(0129, text_pattern_ops)를 타는 형태.
        // %/_는 이스케이프(닉네임 정책상 특수문자 없음이지만 방어).
        sql`lower(${characters.nickname}) like lower(${q.replaceAll('%', '\\%').replaceAll('_', '\\_')}) || '%'`,
      ),
    )
    .orderBy(characters.nickname)
    .limit(5);
  return NextResponse.json({ nicknames: rows.map((r) => r.nickname) });
}
