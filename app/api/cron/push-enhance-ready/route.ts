/**
 * 강화 '최대확률 도달' 푸시 발송 — 2026-05-26 정정된 알림 의도.
 *
 * 발송 시점: 잡의 complete_at <= now() 도달(=base rate 최대치) 시점.
 *  - 사용자가 강화 시도하기 전, 시도 가능 상태일 때 알려서 시도 유도
 *  - 시도 후 결과(success/hold/down)에는 별도 알림 없음
 *
 * 멱등: enhancement_jobs.push_sent=true 마크. 같은 잡 중복 발송 X.
 *
 * 매 1분 cron(평균 30초 지연 — 사실상 즉시 체감). partial index(ej_push_ready_idx)로 빠른 조회.
 */
import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { appendEnhanceReady } from '@/lib/push/pending';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CHUNK = 50;

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization');
    if (auth === `Bearer ${secret}`) return true;
  }
  if (req.headers.get('x-vercel-cron')) return true;
  const ua = req.headers.get('user-agent') ?? '';
  if (ua.startsWith('vercel-cron/')) return true;
  return false;
}

type ReadyRow = {
  job_id: string;
  user_id: string;
  from_level: number;
  target_level: number;
  item_ko: string;
};

export async function GET(req: Request) {
  if (!isAuthorized(req)) return new Response('forbidden', { status: 403 });

  // running + 최대확률 도달 + 미발송 + 토글 ON 잡 조회.
  // 카탈로그 name도 join — 알림 본문에 아이템명 노출.
  const due = (await db.execute(sql`
    select j.id::text as job_id,
           j.user_id::text as user_id,
           j.from_level,
           j.target_level,
           ci.name as item_ko
    from enhancement_jobs j
    join equipment_instances ei on ei.id = j.equipment_instance_id
    join catalog_items ci on ci.id = ei.catalog_item_id
    join profiles p on p.id = j.user_id
    where j.status = 'running'
      and j.push_sent = false
      and j.complete_at <= now()
      and p.push_enhance = true
    order by j.complete_at asc
    limit ${CHUNK}
  `)) as unknown as ReadyRow[];

  if (due.length === 0) {
    return Response.json({ ok: true, sent: 0, kind: 'push-enhance-ready' });
  }

  let sent = 0;
  let failed = 0;
  const sentJobIds: string[] = [];

  for (const r of due) {
    try {
      await appendEnhanceReady(r.user_id, {
        jobId: r.job_id,
        fromLevel: r.from_level,
        targetLevel: r.target_level,
        itemKo: r.item_ko,
      });
      sent++;
      sentJobIds.push(r.job_id);
    } catch (e) {
      failed++;
      console.warn('[push-enhance-ready] job', r.job_id, e);
    }
  }

  // 발송 성공한 잡만 push_sent=true 마크. 실패는 다음 cron 자동 재시도.
  if (sentJobIds.length > 0) {
    await db.execute(sql`
      update enhancement_jobs
      set push_sent = true
      where id::text = any(${sentJobIds}::text[])
    `);
  }

  return Response.json({
    ok: true,
    candidates: due.length,
    sent,
    failed,
    kind: 'push-enhance-ready',
  });
}
