/**
 * 파견 '귀환 완료' 푸시 — push-enhance-ready의 원자 클레임 패턴 미러(EXPEDITION.md A′).
 *
 * 5분 주기(파견 최소 단위 4h — 분 단위 즉시성 불필요). UPDATE...RETURNING으로 push_sent=true
 * 선마킹한 행만 발송(멱등·재발송 없음 — 1회 누락 < N회 폭격). FOR UPDATE SKIP LOCKED로
 * 동시 실행 안전. 배칭 없음(instant) — 일 유저당 최대 6건이라 소음 아님, 토글 없는 상시 카테고리.
 */
import { sql } from 'drizzle-orm';

import { isCronAuthorized } from '@/lib/auth/cron-auth';
import { db } from '@/lib/db/client';
import { sendPushToUser } from '@/lib/push/send';
import { beatCron } from '@/lib/cron/heartbeat';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const REGION_KO: Record<string, string> = {
  swamp: '슬라임 늪', orc: '오크 부락', kingdom: '왕국',
  temple: '잊힌 신전', volcano: '드래곤 화산', angel: '타락 천사 부유섬',
};
const CHUNK = 50;

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return new Response('forbidden', { status: 403 });
  let sent = 0;
  let failed = 0;
  for (;;) {
    const claimed = (await db.execute(sql`
      with target as (
        select e.id from expeditions e
        where e.status = 'running' and e.push_sent = false and e.complete_at <= now()
        order by e.complete_at
        limit ${CHUNK}
        for update skip locked
      )
      update expeditions e set push_sent = true
      from target t where e.id = t.id
      returning e.user_id::text, e.server_id, e.region::text
    `)) as unknown as { user_id: string; server_id: number; region: string }[];
    if (claimed.length === 0) break;
    for (const r of claimed) {
      try {
        await sendPushToUser(r.user_id, {
          title: '파견 귀환',
          body: `${REGION_KO[r.region] ?? r.region} 원정대가 돌아왔어요 — 보상을 수령하세요!`,
          url: '/expedition',
          tag: 'expedition',
          category: 'expedition',
        });
        sent++;
      } catch (e) {
        failed++;
        console.error('[push-expedition-ready]', r.user_id, e);
      }
    }
    if (claimed.length < CHUNK) break;
  }
  await beatCron('push-expedition-ready');
  return Response.json({ ok: true, sent, failed, kind: 'push-expedition-ready' });
}
