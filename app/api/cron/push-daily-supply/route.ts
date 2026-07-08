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
import { beatCron } from '@/lib/cron/heartbeat';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const CHUNK = 200;
// 청크 간 지연 — 전원 동시 수신 시 유저들이 한 시점에 몰려 진입(홈 풀로드+일일보급 write)해
// 커넥션 풀이 스파이크로 포화되는 thundering herd 완화. 도착 시각을 청크 단위로 분산한다.
const CHUNK_DELAY_MS = 15_000;

type Row = { user_id: string };

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return new Response('forbidden', { status: 403 });

  // 재개형 멱등 게이트 — kst_day 행을 claim하고, completed_at이 찍히기 전까지는
  // 30분 fallback cron이 cursor_user_id부터 이어서 발송한다(타임아웃 중단 시 영구 부분발송 방지).
  await db.execute(sql`
    insert into daily_supply_broadcasts (kst_day)
    values ((now() at time zone 'Asia/Seoul')::date)
    on conflict (kst_day) do nothing
  `);
  const [state] = (await db.execute(sql`
    select kst_day, cursor_user_id, coalesce(recipients, 0)::int as recipients, completed_at
    from daily_supply_broadcasts
    where kst_day = (now() at time zone 'Asia/Seoul')::date
  `)) as unknown as Array<{
    kst_day: string;
    cursor_user_id: string | null;
    recipients: number;
    completed_at: string | null;
  }>;
  if (!state || state.completed_at) {
    await beatCron('push-daily-supply', 'already_sent/no-work'); // 정상 no-op — dead-man 오알림 방지
    return Response.json({ ok: true, skipped: true, reason: 'already_sent_today', kind: 'push-daily-supply' });
  }
  const kstDay = state.kst_day;

  // 구독이 1건 이상 있는 유저 중 push_supply ON — 커서 이후만, id 순 결정적 페이지네이션.
  const cursor = state.cursor_user_id ?? '00000000-0000-0000-0000-000000000000';
  const rows = (await db.execute(sql`
    select distinct p.id::text user_id
    from profiles p
    inner join push_subscriptions s on s.user_id = p.id
    where p.push_supply = true and p.id > ${cursor}::uuid
    order by user_id
  `)) as unknown as Row[];

  if (rows.length === 0) {
    await db.execute(sql`
      update daily_supply_broadcasts set completed_at = now(), sent_at = coalesce(sent_at, now())
      where kst_day = ${kstDay}
    `);
    // 구독+토글 유저 0명(출시 초기)이라도 정상 완료 — beat를 찍어 dead-man 오알림(영구 stale) 방지.
    await beatCron('push-daily-supply', 'recipients=0');
    return Response.json({ ok: true, recipients: state.recipients, resumed: !!state.cursor_user_id, kind: 'push-daily-supply' });
  }

  const payload = {
    title: '오늘의 보급 도착',
    body: '일일 보급 상자가 도착했어요. 받으러 오세요.',
    url: '/mail',
    tag: 'supply-daily',
    category: 'supply' as const,
  };

  // maxDuration(300s) 안에서 처리 가능한 만큼만 — 시간 예산 소진 시 커서를 남기고 종료,
  // 잔여는 다음 30분 cron이 이어서 발송.
  const startedAt = Date.now();
  const TIME_BUDGET_MS = 240_000;
  let okSum = 0;
  let goneSum = 0;
  let failedSum = 0;
  let processed = 0;
  // CAS 커서 — 발송 **전에** 이전 커서 값 조건부로 전진시켜 청크를 선점한다(감사 M-3).
  // 재시도/수동 트리거로 두 인스턴스가 겹치면 CAS가 한쪽만 통과 → 같은 구간 중복 푸시 차단.
  // 선점 후 발송 실패는 그 청크 유실(알림이라 허용 — push-flush와 동일 트레이드오프).
  let prevCursor: string | null = state.cursor_user_id;
  for (let i = 0; i < rows.length; i += CHUNK) {
    if (i > 0) {
      if (Date.now() - startedAt > TIME_BUDGET_MS) break;
      await new Promise((r) => setTimeout(r, CHUNK_DELAY_MS));
    }
    const chunk = rows.slice(i, i + CHUNK);
    const nextCursor = chunk[chunk.length - 1]!.user_id;
    const claimed = (await db.execute(sql`
      update daily_supply_broadcasts
      set cursor_user_id = ${nextCursor},
          recipients = coalesce(recipients, 0) + ${chunk.length},
          sent_at = coalesce(sent_at, now())
      where kst_day = ${kstDay}
        and completed_at is null
        and cursor_user_id is not distinct from ${prevCursor}
      returning kst_day
    `)) as unknown as unknown[];
    if (claimed.length === 0) {
      console.warn('[push-daily-supply] 커서 선점 실패 — 다른 인스턴스 진행 중, 중단');
      break;
    }
    prevCursor = nextCursor;
    const res = await sendPushToUsers(chunk.map((r) => r.user_id), payload);
    okSum += res.ok;
    goneSum += res.gone;
    failedSum += res.failed;
    processed += chunk.length;
  }

  const done = processed >= rows.length;
  if (done) {
    await db.execute(sql`
      update daily_supply_broadcasts set completed_at = now() where kst_day = ${kstDay}
    `);
  }

  await beatCron('push-daily-supply', `sent=${okSum} done=${done}`);
  return Response.json({
    ok: true,
    recipients: state.recipients + processed,
    sent: okSum,
    gone: goneSum,
    failed: failedSum,
    completed: done,
    remaining: rows.length - processed,
    kind: 'push-daily-supply',
  });
}
