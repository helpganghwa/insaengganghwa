import 'server-only';

import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';

/**
 * 이벤트형 과제 달성 마킹 — 상태 흔적이 없는 행위(거주 이동·아바타 변경·자랑 공유·앱 실행)를
 * 해당 액션 안에서 1줄 호출로 기록(PK 멱등, best-effort — 실패해도 본 액션은 성공 유지).
 */
export async function markChallengeEvent(
  dbx: { execute: (typeof db)['execute'] },
  userId: string,
  serverId: number,
  eventId: 'app_install' | 'boast_share' | 'residence_move' | 'avatar_change',
): Promise<void> {
  try {
    await dbx.execute(sql`
      insert into challenge_events (user_id, server_id, event_id)
      values (${userId}::uuid, ${serverId}, ${eventId})
      on conflict do nothing
    `);
  } catch {
    /* best-effort — 과제 마킹 실패가 본 액션을 막지 않는다 */
  }
}
