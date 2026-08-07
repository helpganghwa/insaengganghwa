/**
 * 우편 만료/보관 정리 — 두 조건 OR:
 *  (a) 미수령 + 만료(`expires_at < now() AND claimed_at IS NULL`) — 미수령은 **만료로만** 삭제.
 *  (b) 수령완료 + 발송 후 30일 경과(`claimed_at IS NOT NULL AND created_at < now() - 30 days`) —
 *      수령완료 mail이 영구 누적돼 DB 비대해지는 문제 방지(보관 SLA = 30일). 감사 G1/H2: 미수령
 *      우편은 절대 (b)로 안 지워지도록 claimed 가드 — 만료(>30일) 우편이 미수령 상태로 조용히
 *      삭제돼 보상 유실되던 footgun 차단(현재 모든 우편 ≤7일이라 미발현이나 방어).
 *
 * 정책:
 *  - claim 경로(claim.ts)는 이미 `gt(expiresAt, now())` 가드라 만료 우편은 수령 불가.
 *    이 cron은 누적 데이터 정리(인박스/색인 성능)용. lazy 만료 + cron 정리 = M5 v1.
 *  - mail_claim_logs는 `onDelete: 'set null'`로 mailId 보존(분배 감사 흔적 유지).
 *  - 정리 작업을 여기에 모은다 — world_events 90일 · 월드 채팅 · 귓속말 · 길드 가입 신청 만료.
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
import { cleanupChat } from '@/lib/game/chat/service';
import { cleanupWhispers } from '@/lib/game/chat/whisper';
import { GUILD_JOIN_REQUEST_TTL_DAYS } from '@/lib/game/guild/balance';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// 배치 삭제(감사 P1) — 일일 보급·대난투 우편은 유저당 매일 2건+라 무제한 단문 DELETE는
// 유저 수 비례로 statement_timeout(2분)에 걸리고, 실패→적체→다음 날 더 큰 DELETE의
// 영구 실패 루프가 된다. 5,000행씩 잘라 지우고 남으면 다음 배치(시간 예산 내 루프).
const BATCH = 5_000;
const TIME_BUDGET_MS = 90_000;

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) {
    return new Response('forbidden', { status: 403 });
  }
  // (a) 미수령+만료 OR (b) 수령완료 후 30일 경과 row 삭제.
  // (a)는 부분 인덱스(mailbox_user_unclaimed_idx), (b)는 mailbox_claimed_created_idx(0107).
  const startedAt = Date.now();
  let deleted = 0;
  for (;;) {
    const rows = (await db.execute(sql`
      delete from mailbox
      where id in (
        select id from mailbox
        where (claimed_at is null and expires_at < now())
           or (claimed_at is not null and created_at < now() - interval '30 days')
        limit ${BATCH}
      )
      returning id
    `)) as unknown as { id: string }[];
    deleted += rows.length;
    if (rows.length < BATCH) break;
    if (Date.now() - startedAt > TIME_BUDGET_MS) break; // 잔여는 내일(또는 수동 재호출)
  }

  // world_events 90일 보존(감사 P1) — 삭제 경로가 없어 단조 증가하던 피드 로그 정리.
  // 읽기는 최신 limit이라 90일이면 충분(연대기·업적은 별도 테이블에 영속).
  let eventsDeleted = 0;
  const evRows = (await db.execute(sql`
    delete from world_events
    where id in (
      select id from world_events
      where created_at < now() - interval '90 days'
      limit ${BATCH}
    )
    returning id
  `)) as unknown as { id: string }[];
  eventsDeleted = evRows.length;

  // 월드 채팅 보존 정리(0125) — 7일 초과 또는 서버당 최근 1,000개 초과분.
  const chatDeleted = await cleanupChat().catch(() => 0);

  // 귓속말 보존 정리(0155) — 30일 초과 또는 대화당 최근 500건 초과분. 채팅과 시간예산을
  // 나눠 쓰지 않고 순차 실행 — 둘 다 자체 예산(30s) 안에서 끝내고 잔여는 다음 날로 넘긴다.
  const whisperDeleted = await cleanupWhispers().catch(() => 0);

  // 길드 가입 신청 만료(2026-07-30) — GUILD_JOIN_REQUEST_TTL_DAYS 초과분 삭제.
  // 조회 측(getJoinRequests)이 이미 시각으로 걸러 즉시 정확하고, 이 삭제는 누적 정리다.
  const joinReqRows = (await db.execute(sql`
    delete from guild_join_requests
    where created_at < now() - (${GUILD_JOIN_REQUEST_TTL_DAYS} || ' days')::interval
    returning user_id
  `)) as unknown as { user_id: string }[];
  const joinRequestsExpired = joinReqRows.length;

  return Response.json({
    ok: true,
    kind: 'mail-expire',
    deleted,
    eventsDeleted,
    chatDeleted,
    whisperDeleted,
    joinRequestsExpired,
  });
}
