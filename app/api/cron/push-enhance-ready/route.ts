/**
 * 강화 '최대확률 도달' 푸시 발송 — 2026-05-26 정정된 알림 의도.
 *
 * 발송 시점: 잡의 complete_at <= now() 도달(=base rate 최대치) 시점.
 *  - 사용자가 강화 시도하기 전, 시도 가능 상태일 때 알려서 시도 유도
 *  - 시도 후 결과(success/hold/down)에는 별도 알림 없음
 *
 * 멱등(2026-05-26 hotfix): 단일 SQL `UPDATE...RETURNING`으로 push_sent=true를
 * **선마킹**한 row만 발송 대상으로 클레임. select→update 분리 시 UPDATE 실패/race로
 * 매분 재발송하는 버그가 있어 원자 클레임으로 교체. 마킹된 row의 발송이 실패해도
 * **재발송하지 않음**(1회 누락 < N회 폭격 트레이드오프) — 누락 시 사용자가 진입해서
 * 직접 확인. FOR UPDATE SKIP LOCKED로 cron 동시 실행 안전.
 *
 * 매 1분 cron(평균 30초 지연 — 사실상 즉시 체감). partial index(ej_push_ready_idx)로 빠른 조회.
 */
import { sql } from 'drizzle-orm';

import { isCronAuthorized } from '@/lib/auth/cron-auth';
import { db } from '@/lib/db/client';
import { appendEnhanceReady } from '@/lib/push/pending';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CHUNK = 50;

type ReadyRow = {
  job_id: string;
  user_id: string;
  from_level: number;
  target_level: number;
  item_ko: string;
  slot: 'weapon' | 'armor' | 'accessory';
  slot_lane: number;
};

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return new Response('forbidden', { status: 403 });

  // 원자 클레임: 단일 UPDATE 문으로 push_sent=true 마킹하면서 발송 대상 RETURNING.
  // 같은 잡이 동시 cron에서 두 번 select되지 않도록 FOR UPDATE SKIP LOCKED.
  // catalog_items join은 RETURNING 후 별도 CTE로 — UPDATE RETURNING은 자기 테이블 컬럼만.
  const claimed = (await db.execute(sql`
    with target as (
      select j.id
      from enhancement_jobs j
      join profiles p on p.id = j.user_id
      where j.status = 'running'
        and j.push_sent = false
        and j.complete_at <= now()
        and p.push_enhance = true
      order by j.complete_at asc
      limit ${CHUNK}
      for update of j skip locked
    ),
    updated as (
      update enhancement_jobs
      set push_sent = true
      where id in (select id from target)
      returning id, user_id, from_level, target_level, user_equipment_id, slot, slot_lane
    )
    select u.id::text as job_id,
           u.user_id::text as user_id,
           u.from_level,
           u.target_level,
           u.slot::text as slot,
           u.slot_lane as slot_lane,
           ci.name as item_ko
    from updated u
    join user_equipment ue on ue.id = u.user_equipment_id
    join catalog_items ci on ci.id = ue.catalog_item_id
  `)) as unknown as ReadyRow[];

  if (claimed.length === 0) {
    return Response.json({ ok: true, sent: 0, kind: 'push-enhance-ready' });
  }

  // 마킹은 이미 끝났음 — 발송 실패해도 재시도 안 함(폭격 방지).
  let sent = 0;
  let failed = 0;
  for (const r of claimed) {
    try {
      await appendEnhanceReady(r.user_id, {
        jobId: r.job_id,
        fromLevel: r.from_level,
        targetLevel: r.target_level,
        itemKo: r.item_ko,
        slot: r.slot,
        slotLane: r.slot_lane,
      });
      sent++;
    } catch (e) {
      failed++;
      console.warn('[push-enhance-ready] send failed (no retry — already marked)', r.job_id, e);
    }
  }

  return Response.json({
    ok: true,
    claimed: claimed.length,
    sent,
    failed,
    kind: 'push-enhance-ready',
  });
}
