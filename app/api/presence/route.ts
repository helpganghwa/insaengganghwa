import { sql } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { getActiveServerId } from '@/lib/game/servers';
import { db } from '@/lib/db/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 접속 하트비트(2026-08-06) — 서버 액션(heartbeatAction)에서 이전. 액션은 응답에 현재
 * 페이지+layout 전체 RSC 재렌더가 동봉되어, 순수 presence 목적에 2분마다 7~9쿼리가
 * 붙었다(전수 감사 P1). 조건부 UPDATE 2회면 끝나는 작업이라 204 라우트가 정합.
 * 클라 쿠키 게이트(2분)가 통과시킬 때만 호출됨 — 서버측에도 110s WHERE 이중 스로틀.
 */
export async function POST() {
  const userId = await getSessionUserId();
  if (!userId) return new Response(null, { status: 204 });
  const serverId = await getActiveServerId();
  await db
    .execute(
      sql`update characters set last_seen_at = now()
          where user_id = ${userId} and server_id = ${serverId}
            and (last_seen_at is null or last_seen_at < now() - interval '110 seconds')`,
    )
    .catch(() => {});
  // 활성 서버 추적(SERVER.md 경계규칙1 — 푸시 필터). 변경시에만 쓰기.
  await db
    .execute(
      sql`update profiles set last_server_id = ${serverId}
          where id = ${userId} and last_server_id is distinct from ${serverId}`,
    )
    .catch(() => {});
  return new Response(null, { status: 204 });
}
