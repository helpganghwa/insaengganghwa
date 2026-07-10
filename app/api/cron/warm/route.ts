/**
 * Warm-ping cron — 콜드스타트 완화 (2026-05-28).
 *
 * 증상: `/`(및 모든 (game) 경로) 레이아웃의 badges 쿼리가 콜드 DB 커넥션에서
 * 느려져 5s 가드를 넘기고 "Vercel Runtime Timeout" → 504가 간헐 발생.
 * 대책: 5분마다 (1) DB 커넥션 풀과 (2) 페이지 함수 런타임을 미리 깨워 콜드 빈도↓.
 *
 * 인증: CRON_SECRET Bearer 또는 x-vercel-cron 헤더 (profile-poll 패턴).
 */
import { sql } from 'drizzle-orm';

import { isCronAuthorized } from '@/lib/auth/cron-auth';
import { db } from '@/lib/db/client';
import { withTimeout } from '@/lib/db/with-timeout';
import { beatCron, getStaleCrons, markStaleAlerted } from '@/lib/cron/heartbeat';
import { raiseOpsAlert } from '@/lib/ops/alert';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 20;

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return new Response('forbidden', { status: 403 });

  const t0 = Date.now();
  const out: Record<string, unknown> = {};

  // 1. DB 커넥션 풀 warm — 콜드 핸드셰이크 비용을 cron이 미리 지불.
  try {
    await withTimeout(db.execute(sql`select 1`), 6000, 'warm.db');
    out.db = 'ok';
  } catch (e) {
    out.db = (e as Error).message;
  }

  // 2. 페이지 함수 런타임 warm — 자기 도메인 공개 경로 self-fetch.
  try {
    const host = req.headers.get('host');
    const proto = req.headers.get('x-forwarded-proto') ?? 'https';
    if (host) {
      const base = `${proto}://${host}`;
      // 5s 타임아웃 — 페이지 hang이 warm 함수(maxDuration 20s)를 죽여 beatCron 미도달 →
      // "cron 전멸" 오보고로 번지는 것을 차단(페이지 지연은 fetch 결과 'err'로만 기록).
      const settled = await Promise.allSettled([
        fetch(`${base}/login`, { headers: { 'x-warm': '1' }, cache: 'no-store', signal: AbortSignal.timeout(5000) }),
        fetch(`${base}/`, { headers: { 'x-warm': '1' }, redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(5000) }),
      ]);
      out.fetch = settled.map((s) => (s.status === 'fulfilled' ? s.value.status : 'err'));
    }
  } catch (e) {
    out.fetch = (e as Error).message;
  }

  // 3. 크론 dead-man 워치독 — 매분 도는 warm이 다른 크론의 정지(허용 간격 초과)를 감지해
  //    아직 알리지 않은 것만 어드민 푸시/웹훅. warm 자신이 죽으면(=총체적 크론 정지) 여기서
  //    못 알리므로, 외부 uptime 모니터가 최종 백스톱(대시보드도 방문 시 표시).
  try {
    const stale = await getStaleCrons(Date.now());
    const fresh = stale.filter((s) => !s.alerted);
    if (fresh.length > 0) {
      const lines = fresh
        .map((s) => `• ${s.name} — ${s.lastSuccessAt ? `${Math.round(s.ageMs / 60000)}분째 미성공` : '한 번도 성공 없음'}`)
        .join('\n');
      await raiseOpsAlert(`크론 정지 감지 ${fresh.length}건`, lines);
      await markStaleAlerted(fresh.map((s) => s.name));
    }
    out.stale = stale.map((s) => s.name);
  } catch (e) {
    out.stale = (e as Error).message;
  }

  await beatCron('warm');
  return Response.json({ ms: Date.now() - t0, ...out });
}
