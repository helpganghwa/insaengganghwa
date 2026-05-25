/**
 * 강화 자동 정산 cron — `complete_at <= now() AND status='running'`인 잡 일괄 resolve.
 *
 * GDD §3.10 / SCHEMA §3.1 의도: (B) 완료 = Lazy(사용자 접속 시) + Cron(자동).
 * 사용자가 강화소 안 들어와도 정산 + 푸시 적재 보장 → 알림 누락 90%+ 해결.
 *
 * 멱등성: resolveEnhance 자체가 status='running' 조건부 transition + multi-CTE 원자 처리.
 * 동시 호출(사용자 lazy + cron) 안전: 첫 한쪽만 j에 row, 나머지 no-op.
 *
 * 매 10분 실행(vercel.json). 한 cron 호출에서 최대 CHUNK개까지 처리(timeout 보호).
 */
import { and, eq, lte, sql, asc } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { enhancementJobs } from '@/lib/db/schema/enhance';
import { resolveEnhance } from '@/lib/game/enhance/resolve';
import { EnhanceError } from '@/lib/game/enhance/queue';

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

export async function GET(req: Request) {
  if (!isAuthorized(req)) return new Response('forbidden', { status: 403 });

  // complete_at 도달 + 미정산 잡 ID들 — 가장 오래된 것부터(공정성).
  const due = await db
    .select({ id: enhancementJobs.id })
    .from(enhancementJobs)
    .where(
      and(
        eq(enhancementJobs.status, 'running'),
        lte(enhancementJobs.completeAt, sql`now()`),
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
