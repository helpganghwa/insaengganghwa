/**
 * 레이드 자동 정산 cron — `expire_at <= now() AND status='active'`인 레이드 일괄 settle.
 *
 * GDD §3.5 의도: 6시간 만료 시 lazy(사용자 접속) + cron 일괄 정산. 멱등(CLAUDE §3.4).
 * 사용자 미접속 시에도 정산 + 종료 푸시 보장.
 *
 * settleRaid는 status='active' AND expire_at<=now() 조건부 → 'settled' transition + raid_rewards
 * 적재 트랜잭션. 동시 호출(lazy + cron) 안전.
 *
 * 매 5분 실행. CHUNK=20.
 */
import { and, eq, lte, sql, asc } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { raids } from '@/lib/db/schema/raid';
import { settleRaid } from '@/lib/game/raid/settle';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CHUNK = 20;

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

  const due = await db
    .select({ id: raids.id })
    .from(raids)
    .where(and(eq(raids.status, 'active'), lte(raids.expireAt, sql`now()`)))
    .orderBy(asc(raids.expireAt))
    .limit(CHUNK);

  if (due.length === 0) {
    return Response.json({ ok: true, settled: 0, skipped: 0, kind: 'settle-raid' });
  }

  let settled = 0;
  let skipped = 0;
  let failed = 0;
  for (const { id } of due) {
    try {
      const r = await settleRaid({ raidId: id });
      if (r.settled) settled++;
      else skipped++; // 이미 settled(lazy 먼저 처리)
    } catch (e) {
      failed++;
      console.warn('[settle-raid] raid', id.toString(), e);
    }
  }

  return Response.json({
    ok: true,
    settled,
    skipped,
    failed,
    chunk: CHUNK,
    candidates: due.length,
    kind: 'settle-raid',
  });
}
