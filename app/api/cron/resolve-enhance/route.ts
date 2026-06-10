/**
 * 강화 **24h+ 미해결** 자동 정산 cron — GDD §6.1 원래 의도(2026-05-26 정정).
 *
 * 알림은 별도 cron(/api/cron/push-enhance-ready)이 'complete_at 도달 시점'에 처리.
 * 본 cron은 사용자가 24시간+ 페이지에 안 들어와 정산이 누락된 잡만 안전망으로 자동 처리.
 *
 * 의도: 너무 일찍 자동 정산하면 사용자 시도 의지 박탈. 24h+면 잊었거나 의도 방치로 간주.
 *
 * 멱등: resolveEnhance status='running' 조건부 transition. lazy와 동시 안전.
 * 매 1시간(0 * * * *) 실행. CHUNK 50.
 */
import { and, eq, lte, sql, asc } from 'drizzle-orm';

import { isCronAuthorized } from '@/lib/auth/cron-auth';
import { db } from '@/lib/db/client';
import { enhancementJobs } from '@/lib/db/schema/enhance';
import { resolveEnhance } from '@/lib/game/enhance/resolve';
import { EnhanceError } from '@/lib/game/enhance/queue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CHUNK = 50;
const STALE_HOURS = 24;

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return new Response('forbidden', { status: 403 });

  // complete_at + STALE_HOURS 이상 지난 미정산 잡만 — 즉 24시간+ 방치된 잡.
  const due = await db
    .select({ id: enhancementJobs.id })
    .from(enhancementJobs)
    .where(
      and(
        eq(enhancementJobs.status, 'running'),
        lte(enhancementJobs.completeAt, sql`now() - interval '${sql.raw(String(STALE_HOURS))} hours'`),
      ),
    )
    .orderBy(asc(enhancementJobs.completeAt))
    .limit(CHUNK);

  if (due.length === 0) {
    return Response.json({ ok: true, resolved: 0, skipped: 0, failed: 0, kind: 'resolve-enhance' });
  }

  let resolved = 0;
  let skipped = 0; // 사용자 lazy가 먼저 처리한 경우 JOB_NOT_FOUND
  let failed = 0;
  // 순차 처리 — 한 트랜잭션 실패가 다른 것 막지 않음. 큰 부담 X(CHUNK=50, 각 ~50ms).
  for (const { id } of due) {
    try {
      await resolveEnhance({ jobId: id, requireComplete: true });
      resolved++;
    } catch (e) {
      if (e instanceof EnhanceError && e.code === 'JOB_NOT_FOUND') {
        skipped++; // 멱등 no-op
      } else {
        failed++;
        console.warn('[resolve-enhance] job', id.toString(), e);
      }
    }
  }

  return Response.json({
    ok: true,
    resolved,
    skipped,
    failed,
    chunk: CHUNK,
    candidates: due.length,
    kind: 'resolve-enhance',
  });
}
