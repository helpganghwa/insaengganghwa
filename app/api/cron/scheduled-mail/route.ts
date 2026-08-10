/**
 * 예약 발행 크론 — **운영자 우편(0123) + 공지(0158)** 둘 다 여기서 처리한다.
 * 5분 주기(:2 오프셋, :00 혼잡 회피 §11). 예약 발행은 주기·인증·클레임 패턴이 동일해
 * 크론을 따로 늘리지 않는다(Vercel 크론 20개 한도).
 *
 * 우편: due 행을 sent_at 조건부 스탬프로 **클레임**(동시 발화 이중 발송 차단) 후, broadcast와
 * 동일한 단일 INSERT…SELECT fan-out + admin_mail_logs 기록 + (옵션) 웹푸시.
 * 공지: 도래한 초안을 단일 UPDATE…RETURNING으로 클레임 후 캐시 무효화.
 */
import { revalidateTag } from 'next/cache';
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
    // ── 예약 공지 발행(0158) ── 우편과 독립 — 여기서 터져도 위 우편 발송 결과는 지킨다.
    let announcementsPublished = 0;
    try {
      // 클레임 UPDATE — scheduled_at을 비워 재실행·동시 발화에도 한 번만 발행되게 한다
      // (발행 후 예약값이 남으면 목록에서도 "발행됐는데 예약 있음"으로 읽혀 혼란).
      // published_at은 coalesce로 보존 — 최초 발행 시각이 노출/정렬 기준이라 재편집 이력이 밀리면 안 된다.
      const published = (await db.execute(sql`
        update announcements
        set published = true,
            published_at = coalesce(published_at, now()),
            scheduled_at = null,
            updated_at = now()
        where published = false and scheduled_at is not null and scheduled_at <= now()
        returning id, title
      `)) as unknown as { id: string; title: string }[];
      announcementsPublished = published.length;
      if (announcementsPublished > 0) {
        // listPublishedAnnouncements가 unstable_cache(30s, tags:['announcements'])라
        // 무효화하지 않으면 발행해도 유저 화면에 안 뜬다.
        try {
          revalidateTag('announcements', 'max');
        } catch (e) {
          console.warn('[scheduled-mail] revalidate failed', (e as Error).message);
        }
        console.info('[scheduled-mail] announcements published', published.map((a) => a.title));
      }
    } catch (e) {
      console.error('[scheduled-mail] announcement publish', e);
    }

    return Response.json({ ok: true, dispatched: due.length, mailed: sent, announcementsPublished });
  } catch (e) {
    console.error('[scheduled-mail]', e);
    return Response.json({ ok: false }, { status: 500 });
  }
}
