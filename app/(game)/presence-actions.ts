'use server';

import { sql } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { getActiveServerId } from '@/lib/game/servers';
import { db } from '@/lib/db/client';

/**
 * 접속 하트비트 — 클라 쿠키 게이트(2분)가 통과시킬 때만 호출됨(대부분 요청은 호출 0).
 * 서버측에도 안전 스로틀(WHERE) — 쿠키 변조/중복 호출 시에도 110s 이내면 no-op(0행).
 * best-effort: 실패해도 무시(접속표시는 부가 정보).
 */
export async function heartbeatAction(): Promise<void> {
  const userId = await getSessionUserId();
  if (!userId) return;
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
}
