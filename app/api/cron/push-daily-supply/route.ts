/**
 * 일일 보급 충전 푸시 — KST 00:00에 push_supply 토글 ON 구독자 전원 발송.
 *
 * 실제 보급 mailbox 적재는 ensureDailyMail이 사용자 layout 진입 시 lazy 처리(기존 멱등).
 * 본 cron은 "도착 알림"만 — 푸시 받고 사용자가 게임 진입하면 그때 mail이 생성됨.
 *
 * 대상: 푸시 구독이 있는 모든 유저 중 push_supply=true인 사용자.
 * 동시 broadcast 큰 트래픽은 chunk 발송으로 보호.
 */
import { sql } from 'drizzle-orm';

import { isCronAuthorized } from '@/lib/auth/cron-auth';
import { db } from '@/lib/db/client';
import { sendPushToUsers } from '@/lib/push/send';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CHUNK = 200;

type Row = { user_id: string };

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return new Response('forbidden', { status: 403 });

  // 멱등 게이트 — 오늘 KST 이미 발송했으면 skip. 매 30분 fallback cron이 안전하게 재시도 가능.
  // INSERT ON CONFLICT DO NOTHING 결과 0 row면 이미 발송됨(=skip).
  const claim = (await db.execute(sql`
    insert into daily_supply_broadcasts (kst_day)
    values ((now() at time zone 'Asia/Seoul')::date)
    on conflict (kst_day) do nothing
    returning kst_day
  `)) as unknown as Array<{ kst_day: string }>;
  if (claim.length === 0) {
    return Response.json({ ok: true, skipped: true, reason: 'already_sent_today', kind: 'push-daily-supply' });
  }

  // 구독이 1건 이상 있는 유저 중 push_supply ON. 한 번에 모두 조회 후 chunk 발송.
  // (DAU 1k 이하 가정. 만 단위가 되면 페이지네이션 필요.)
  const rows = (await db.execute(sql`
    select distinct p.id::text user_id
    from profiles p
    inner join push_subscriptions s on s.user_id = p.id
    where p.push_supply = true
  `)) as unknown as Row[];

  if (rows.length === 0) {
    return Response.json({ ok: true, recipients: 0, kind: 'push-daily-supply' });
  }

  const payload = {
    title: '오늘의 보급 도착',
    body: '일일 보급 상자가 도착했어요. 받으러 오세요.',
    url: '/mail',
    tag: 'supply-daily',
    category: 'supply' as const,
  };

  let okSum = 0;
  let goneSum = 0;
  let failedSum = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const ids = rows.slice(i, i + CHUNK).map((r) => r.user_id);
    const res = await sendPushToUsers(ids, payload);
    okSum += res.ok;
    goneSum += res.gone;
    failedSum += res.failed;
  }

  // 발송 통계 기록 (이미 INSERT된 row 업데이트)
  await db.execute(sql`
    update daily_supply_broadcasts
    set recipients = ${rows.length}
    where kst_day = (now() at time zone 'Asia/Seoul')::date
  `);

  return Response.json({
    ok: true,
    recipients: rows.length,
    sent: okSum,
    gone: goneSum,
    failed: failedSum,
    kind: 'push-daily-supply',
  });
}
