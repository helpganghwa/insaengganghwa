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
import { beatCron } from '@/lib/cron/heartbeat';
import { db } from '@/lib/db/client';
import { SENDABLE_SQL } from '@/lib/game/account/ban';
import { profiles } from '@/lib/db/schema/profiles';
import { openChuseokCatalogIfDue } from '@/lib/game/chuseok/open';
import { recordTowerSection12SnapshotIfDue } from '@/lib/game/tower/open';
import { openHalloweenCatalogIfDue } from '@/lib/game/halloween/open';
import { raiseOpsAlert } from '@/lib/ops/alert';
import { sendPushToUsers } from '@/lib/push/send';
import { mailBodyPlain } from '@/lib/ui/mail-links';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** 본문 → 푸시용 발췌: 문장 단위로 누적해 max자 이내(첫 문장이 max를 넘으면 잘라 '…'). */
function pushExcerpt(body: string, max: number): string {
  const plain = mailBodyPlain(body).replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
  const sentences = plain.match(/[^.!?]+[.!?]?/g) ?? [plain];
  let out = '';
  for (const raw of sentences) {
    const sent = raw.trim();
    if (!sent) continue;
    const next = out ? `${out} ${sent}` : sent;
    if (next.length > max) break;
    out = next;
  }
  if (!out) out = plain.length > max ? `${plain.slice(0, max - 1)}…` : plain;
  return out;
}

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return new Response('forbidden', { status: 403 });
  try {
    type Due = { id: string; admin_id: string; title: string; body: string; payload: unknown; push: boolean; server_id: number | null };
    // 클레임은 **한 통씩**(11-16 적대적 검수 F1) — 한꺼번에 찍으면 함수가 시간 제한에 걸려 죽을 때 남은 우편이
    // '발송됨'으로 찍힌 채 영영 안 나갔다. 행 잠금(skip locked)이라 동시 발화도 한 통을 두 번 집지 않는다.
    // 이번 틱에 실패해 클레임을 푼 우편은 다시 집지 않는다 — 안 그러면 같은 우편을 곧바로 다시 집어 60초 내내
    // 실패·경보를 되풀이하고 뒤 우편이 막힌다(11-17 검수). 다음 틱(5분)에 다시 시도한다.
    const failedIds: string[] = [];
    const claimNext = async (): Promise<Due | null> => {
      const [row] = (await db.execute(sql`
        update admin_scheduled_mails set sent_at = now()
         where id = (select id from admin_scheduled_mails
                      where scheduled_at <= now() and sent_at is null and canceled_at is null
                        and not (id::text = any(${`{${failedIds.join(',')}}`}::text[]))
                      order by scheduled_at, id limit 1 for update skip locked)
        returning id::text as id, admin_id, title, body, payload, push, server_id
      `)) as unknown as Due[];
      return row ?? null;
    };
    const startedAt = Date.now();
    let dispatched = 0;

    let sent = 0;
    let failed = 0;
    // 함수 제한(120초) 전에 멈춘다 — 남은 우편은 클레임되지 않은 채라 다음 틱(5분)이 이어 보낸다.
    for (let m = await claimNext(); m; m = Date.now() - startedAt < 60_000 ? await claimNext() : null) {
      dispatched += 1;
      // 대상 서버(0208): 숫자면 그 서버 캐릭터 보유자에게만 그 서버 우편함으로(즉시 발송과 동일),
      // null이면 전 서버 = **캐릭터가 있는 서버마다 1통**(2026-09-21 결정 D2). 종전에는 계정당 1통을
      // last_server_id로 보내, 두 서버를 하는 사람은 한쪽에서만 받고 캐릭터가 없는 서버 우편함에
      // 떨어지면 영영 못 받았다. 일일 보급·출석과 같은 기준(캐릭터마다)이 된다. 알림은 계정당 한 번.
      // 전 서버 발송은 닫힌(closed) 서버 캐릭터를 뺀다 — 닫힌 서버는 자산이 동결돼 받을 수 없다(10-12 결정 ⑤).
      const target = m.server_id;
      const label = target == null ? '전체(예약)' : `${target}서버(예약)`;
      let count = 0;
      try {
        // 적재와 발송 기록은 한 문장(원자) — 실패하면 아무것도 남지 않아 다시 보내도 중복이 없다. 수신자 수도 함께 기록한다.
        const [row] = (await db.execute(sql`
          with lg as (
            -- 이 예약 우편의 발송 기록(멱등 키 = 예약 id에서 만든 uuid). 커밋 뒤 응답 전에 연결이 끊겨 실패로 보고 다시
            -- 보내도(11-16 적대적 검수 F1), 기록이 이미 있으면 여기서 0행이 되고 아래 적재도 건너뛴다 — 이중 발송 없음.
            insert into admin_mail_logs (admin_id, mode, recipient_count, target_label, title, body, payload, idempotency_key)
            values (${m.admin_id}::uuid, 'broadcast', 0, ${label}, ${m.title}, ${m.body}, ${JSON.stringify(m.payload)}::jsonb,
                    md5(${'scheduled-mail:' + m.id})::uuid)
            on conflict (idempotency_key) do nothing
            returning id
          ),
          dest as (
            select c.user_id, c.server_id
              from characters c
              join profiles p on p.id = c.user_id
              join servers s on s.id = c.server_id
             where p.withdrawn_at is null
               and (${target}::smallint is not null or s.status <> 'closed')
               and (${target}::smallint is null or c.server_id = ${target}::smallint)
          ),
          ins as (
            insert into mailbox (user_id, server_id, type, title, body, sender_label, payload)
            select d.user_id, d.server_id, 'admin'::mailbox_type, ${m.title}, ${m.body}, '인생강화', ${JSON.stringify(m.payload)}::jsonb
            from dest d
            where exists (select 1 from lg)
            returning 1
          )
          select (select count(*)::int from ins) as n, (select id::text from lg) as log_id
        `)) as unknown as { n: number; log_id: string | null }[];
        if (row?.log_id) {
          await db
            .execute(sql`update admin_mail_logs set recipient_count = ${Number(row.n)} where id = ${row.log_id}::bigint`)
            .catch(() => undefined);
        }
        count = Number(row?.n ?? 0);
      } catch (e) {
        // 한 통이 실패해도 뒤 우편·공지 발행은 계속한다(종전엔 남은 우편이 '발송됨'으로 찍힌 채 영영 안 나갔다).
        // 클레임을 풀어 다음 틱(5분)에 다시 보낸다. 1시간 넘게 실패하면 풀지 않고 경보만 남긴다(무한 재시도 방지).
        failed += 1;
        failedIds.push(m.id);
        console.error('[scheduled-mail] mail failed', m.id, e);
        const [rel] = (await db
          .execute(sql`
            update admin_scheduled_mails set sent_at = null
             where id = ${m.id}::bigint and scheduled_at > now() - interval '1 hour'
            returning id
          `)
          .catch(() => [])) as unknown as { id: string }[];
        await raiseOpsAlert(
          '예약 우편 발송 실패',
          `scheduled-mail #${m.id} '${m.title}': ${(e as Error)?.message ?? String(e)} — ${rel ? '다음 틱에 다시 보냄' : '재시도 포기, 어드민에서 다시 보내기'}`,
        ).catch(() => undefined);
        continue;
      }
      sent += count;
      if (m.push) {
        try {
          // 경계규칙1 — 서버 지정 예약이면 활성 서버가 그 서버인 사람에게만(즉시 발송과 동일).
          const ids = (await db.execute(sql`
            select p.id::text as id from profiles p
             where ${SENDABLE_SQL('p')}
               and (${target}::smallint is null or p.last_server_id = ${target}::smallint)
               -- 전 서버 발송은 우편을 받은 사람만(운영 중인 서버에 캐릭터가 있는 계정) — 11-16 적대적 검수 F9
               and (${target}::smallint is not null or exists (
                     select 1 from characters c join servers sv on sv.id = c.server_id
                      where c.user_id = p.id and sv.status <> 'closed'))
          `)) as unknown as { id: string }[];
          // 푸시는 짧게, 우편은 길게(2026-08-29 확정): 제목 = 우편 제목, 본문 = 우편 본문의 첫 문장들을 60자 이내로
          // (문장 단위로 끊어 잘린 말 없이). 마크다운 강조(**)·줄바꿈 제거.
          await sendPushToUsers(ids.map((r) => r.id), {
            title: m.title.slice(0, 60),
            body: pushExcerpt(m.body, 60),
            url: '/mail',
            serverId: target ?? undefined,
            category: 'admin',
          });
        } catch (e) {
          console.warn('[scheduled-mail] push failed', (e as Error).message);
        }
      }
    }
    // ── 한가위 6종 자동 개방(2026-09-22) ── 시작 시각이 지나면 한 번 켠다(멱등). 우편·공지와 독립.
    try {
      await openChuseokCatalogIfDue();
    } catch (e) {
      console.error('[scheduled-mail] chuseok-open failed', e);
      await raiseOpsAlert('추석 6종 개방 실패', `openChuseokCatalogIfDue: ${(e as Error)?.message ?? String(e)}`).catch(() => undefined);
    }
    // ── 무한의 탑 12구간 개방 공시 스냅샷(2026-11-09) ── 개방 정각이 지나면 한 번 기록한다(멱등). 개방 자체는 서버 시각 게이트. 개방 확인 뒤 제거.
    try {
      await recordTowerSection12SnapshotIfDue();
    } catch (e) {
      console.error('[scheduled-mail] tower-open snapshot failed', e);
      await raiseOpsAlert('탑 12구간 공시 스냅샷 실패', `recordTowerSection12SnapshotIfDue: ${(e as Error)?.message ?? String(e)}`).catch(() => undefined);
    }
    // ── 할로윈 6종 자동 개방(2026-10) ── 추석과 같은 방식(멱등).
    try {
      await openHalloweenCatalogIfDue();
    } catch (e) {
      console.error('[scheduled-mail] halloween-open failed', e);
      await raiseOpsAlert('할로윈 6종 개방 실패', `openHalloweenCatalogIfDue: ${(e as Error)?.message ?? String(e)}`).catch(() => undefined);
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

    await beatCron('scheduled-mail', `mail=${sent} failed=${failed} ann=${announcementsPublished}`);
    return Response.json({ ok: failed === 0, dispatched, mailed: sent, failed, announcementsPublished });
  } catch (e) {
    console.error('[scheduled-mail]', e);
    // 우편 한 통의 실패는 위에서 잡아 클레임을 푼다. 여기 오는 건 클레임 자체가 실패했거나 함수가 그 밖에서 죽은 경우다.
    await raiseOpsAlert('예약 우편 크론 실패', `scheduled-mail: ${(e as Error)?.message ?? String(e)} — 어드민에서 해당 우편 발송 여부 확인`).catch(() => undefined);
    return Response.json({ ok: false }, { status: 500 });
  }
}
