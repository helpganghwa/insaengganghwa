/**
 * 우편 만료/보관 정리 — 두 조건 OR:
 *  (a) 미수령 + 만료(`expires_at < now() AND claimed_at IS NULL`) — 종래.
 *  (b) 발송일 기준 30일 경과(`created_at < now() - 30 days`) — 수령 여부 무관(2026-06-01 추가).
 *      claimed mail이 영구 누적되어 DB 비대해지는 문제 방지. 보관 SLA = 30일.
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

import { isCronAuthorized } from '@/lib/auth/cron-auth';
import { db } from '@/lib/db/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) {
    return new Response('forbidden', { status: 403 });
  }
  // (a) 미수령+만료 OR (b) 발송 후 30일 경과 row 삭제.
  // RETURNING id로 삭제 수 산출(서버 로그). 인덱스(mailbox_user_unclaimed_idx)로 (a) 빠름;
  // (b)는 created_at full scan일 수 있으나 매일 1회 KST 03시 호출이라 부담 적음.
  const rows = (await db.execute(sql`
    delete from mailbox
    where (claimed_at is null and expires_at < now())
       or created_at < now() - interval '30 days'
    returning id
  `)) as unknown as { id: string }[];
  const deleted = rows.length;
  return Response.json({ ok: true, kind: 'mail-expire', deleted });
}
