/**
 * 레이드 자동 정산 cron — `expire_at <= now() AND status='active'`인 레이드 일괄 settle.
 *
 * GDD §3.5 의도: 공격창 만료 시 lazy(사용자 접속) + cron 일괄 정산. 멱등(CLAUDE §3.4).
 * 사용자 미접속 시에도 정산 + 종료 푸시 보장.
 *
 * settleRaid는 status='active' AND expire_at<=now() 조건부 → 'settled' transition + raid_rewards
 * 적재 트랜잭션. 동시 호출(lazy + cron) 안전.
 *
 * 매 5분 실행. CHUNK=20.
 */
import { and, eq, lte, sql, asc } from 'drizzle-orm';

import { isCronAuthorized } from '@/lib/auth/cron-auth';
import { db } from '@/lib/db/client';
import { raids } from '@/lib/db/schema/raid';
import { settleRaid } from '@/lib/game/raid/settle';
import { beatCron } from '@/lib/cron/heartbeat';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// 배치 × 시간 예산 드레인(감사 P1) — 고정 20건/5분(240/시간)은 피크에 미접속 정산·푸시가
// 지연 누적된다. lazy settle 백스톱이 있어 유실은 아니나 예산 내 드레인으로 지연 제거.
const CHUNK = 20;
const TIME_BUDGET_MS = 90_000;

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return new Response('forbidden', { status: 403 });

  const startedAt = Date.now();
  let settled = 0;
  let skipped = 0;
  let failed = 0;
  let candidates = 0;

  for (;;) {
    const due = await db
      .select({ id: raids.id })
      .from(raids)
      .where(and(eq(raids.status, 'active'), lte(raids.expireAt, sql`now()`)))
      .orderBy(asc(raids.expireAt))
      .limit(CHUNK);
    candidates += due.length;

    let iterProgress = 0; // 이번 반복 진행량 — 누적 카운터로 판정하면 첫 성공 이후 가드가 무력.
    for (const { id } of due) {
      try {
        const r = await settleRaid({ raidId: id });
        if (r.settled) settled++;
        else skipped++; // 이미 settled(lazy 먼저 처리)
        iterProgress++;
      } catch (e) {
        failed++;
        console.warn('[settle-raid] raid', id.toString(), e);
      }
    }

    if (due.length < CHUNK) break;
    // 이번 배치가 전부 실패면 같은 레이드(선두 정렬 고정)를 재선택해 예산만 태운다 — 중단(다음 틱 재시도).
    if (iterProgress === 0) break;
    if (Date.now() - startedAt > TIME_BUDGET_MS) break;
  }

  await beatCron('settle-raid', `settled=${settled} failed=${failed}`);
  return Response.json({
    ok: true,
    settled,
    skipped,
    failed,
    candidates,
    kind: 'settle-raid',
  });
}
