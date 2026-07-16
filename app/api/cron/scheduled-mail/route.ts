/**
 * 운영자 우편 예약 전송 크론(0123) — 5분 주기(:2 오프셋, :00 혼잡 회피 §11).
 * due 행을 sent_at 조건부 스탬프로 **클레임**(동시 발화 이중 발송 차단) 후, broadcast와
 * 동일한 단일 INSERT…SELECT fan-out + admin_mail_logs 기록 + (옵션) 웹푸시.
 */
import { sql } from 'drizzle-orm';

import { isCronAuthorized } from '@/lib/auth/cron-auth';
import { db } from '@/lib/db/client';
import { profiles } from '@/lib/db/schema/profiles';
import { sendPushToUsers } from '@/lib/push/send';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return new Response('forbidden', { status: 403 });
  try {
    // 클레임 — 도래·미발송·미취소 행을 원자 스탬프(재실행·동시 발화 멱등).
    const due = (await db.execute(sql`
      update admin_scheduled_mails
      set sent_at = now()
      where scheduled_at <= now() and sent_at is null and canceled_at is null
      returning id, admin_id, title, body, payload, push
    `)) as unknown as { id: string; admin_id: string; title: string; body: string; payload: unknown; push: boolean }[];

    let sent = 0;
    for (const m of due) {
      const rows = (await db.execute(sql`
        with lg as (
          insert into admin_mail_logs (admin_id, mode, recipient_count, target_label, title, body, payload)
          values (${m.admin_id}::uuid, 'broadcast', 0, '전체(예약)', ${m.title}, ${m.body}, ${JSON.stringify(m.payload)}::jsonb)
          returning id
        )
        insert into mailbox (user_id, server_id, type, title, body, sender_label, payload)
        select p.id, p.last_server_id, 'admin'::mailbox_type, ${m.title}, ${m.body}, '인생강화', ${JSON.stringify(m.payload)}::jsonb
        from profiles p, lg
        where p.withdrawn_at is null
        returning id
      `)) as unknown as { id: string }[];
      sent += rows.length;
      if (m.push) {
        try {
          const ids = await db
            .select({ id: profiles.id })
            .from(profiles)
            .where(sql`${profiles.withdrawnAt} is null`);
          await sendPushToUsers(ids.map((r) => r.id), {
            title: '운영자 우편 도착',
            body: m.title.slice(0, 60),
            url: '/mail',
            category: 'admin',
          });
        } catch (e) {
          console.warn('[scheduled-mail] push failed', (e as Error).message);
        }
      }
    }
    return Response.json({ ok: true, dispatched: due.length, mailed: sent });
  } catch (e) {
    console.error('[scheduled-mail]', e);
    return Response.json({ ok: false }, { status: 500 });
  }
}
