/**
 * 우편 만료 정리 — `expires_at < now()` 이면서 미수령(`claimed_at IS NULL`)인 행 삭제.
 *
 * 정책:
 *  - claim 경로(claim.ts)는 이미 `gt(expiresAt, now())` 가드라 만료 우편은 수령 불가.
 *    이 cron은 누적 데이터 정리(인박스/색인 성능)용. lazy 만료 + cron 정리 = M5 v1.
 *  - mail_claim_logs는 `onDelete: 'set null'`로 mailId 보존(분배 감사 흔적 유지).
 *  - 일일 보급의 `daily_supply_grants(user_id, kst_day)`는 다음 KST 자정에 자연 갱신.
 *    여기서는 건드리지 않음(과거 그랜트는 통계용으로 보존).
 *
 * 인증: Vercel Cron 호출에 한해 통과. 외부 호출 차단.
 *   - 우선: `Authorization: Bearer ${CRON_SECRET}` (vercel.json에 동일 헤더 주입 가능)
 *   - 폴백: `x-vercel-cron` 헤더 / `user-agent: vercel-cron/*` (Vercel cron 표식)
 *
 * 응답: `{ ok, deleted, kind: 'mail-expire' }`. deleted=0도 ok.
 *
 * 스케줄: vercel.json crons "0 18 * * *" = 매일 UTC 18시(KST 03시). 트래픽 적은 시간대.
 */
import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization');
    if (auth === `Bearer ${secret}`) return true;
  }
  // Vercel cron 자동 호출 — secret 미설정 환경에서도 작동.
  if (req.headers.get('x-vercel-cron')) return true;
  const ua = req.headers.get('user-agent') ?? '';
  if (ua.startsWith('vercel-cron/')) return true;
  return false;
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return new Response('forbidden', { status: 403 });
  }
  // 단일 SQL — DELETE … WHERE expires_at < now() AND claimed_at IS NULL RETURNING id.
  // RETURNING id로 삭제 수 산출(서버 로그). 큰 트랜잭션은 인덱스(mailbox_user_unclaimed_idx)로 빠름.
  const rows = (await db.execute(sql`
    delete from mailbox
    where claimed_at is null
      and expires_at < now()
    returning id
  `)) as unknown as { id: string }[];
  const deleted = rows.length;
  return Response.json({ ok: true, kind: 'mail-expire', deleted });
}
