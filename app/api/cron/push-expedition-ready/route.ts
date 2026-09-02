/**
 * 파견 '귀환 완료' 푸시 — push-enhance-ready의 원자 클레임 패턴 미러(EXPEDITION.md A′).
 *
 * 5분 주기(파견은 단일 8h — 분 단위 즉시성 불필요). UPDATE...RETURNING으로 push_sent=true
 * 선마킹한 행만 발송(멱등·재발송 없음 — 1회 누락 < N회 폭격). FOR UPDATE SKIP LOCKED로
 * 동시 실행 안전. 같은 실행 창의 귀환은 유저별 1건으로 묶는다. push_expedition 토글(0181).
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
    // 유저별로 묶어 1건 — 슬롯 여러 개가 같은 5분 창에 귀환하면 진동 N번 대신 "N팀" 한 번(2026-08-30).
    const byUser = new Map<string, { regions: string[] }>();
    for (const r of claimed) {
      const e = byUser.get(r.user_id) ?? { regions: [] };
      e.regions.push(REGION_KO[r.region] ?? r.region);
      byUser.set(r.user_id, e);
    }
    for (const [userId, e] of byUser) {
      const body =
        e.regions.length === 1
          ? `${e.regions[0]} 원정대가 돌아왔어요 — 보상을 수령하세요!`
          : `원정대 ${e.regions.length}팀이 돌아왔어요(${[...new Set(e.regions)].join('·')}) — 보상을 수령하세요!`;
      try {
        await sendPushToUser(userId, { title: '파견 귀환', body, url: '/expedition', tag: 'expedition', category: 'expedition' });
        sent++;
      } catch (err) {
        failed++;
        console.error('[push-expedition-ready]', userId, err);
      }
    }
    if (claimed.length < CHUNK) break;
  }
  await beatCron('push-expedition-ready');
  return Response.json({ ok: true, sent, failed, kind: 'push-expedition-ready' });
}
