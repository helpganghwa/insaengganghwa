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

import { db } from '@/lib/db/client';
import { withTimeout } from '@/lib/db/with-timeout';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 20;

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
      const settled = await Promise.allSettled([
        fetch(`${base}/login`, { headers: { 'x-warm': '1' }, cache: 'no-store' }),
        fetch(`${base}/`, { headers: { 'x-warm': '1' }, redirect: 'manual', cache: 'no-store' }),
      ]);
      out.fetch = settled.map((s) => (s.status === 'fulfilled' ? s.value.status : 'err'));
    }
  } catch (e) {
    out.fetch = (e as Error).message;
  }

  return Response.json({ ms: Date.now() - t0, ...out });
}
