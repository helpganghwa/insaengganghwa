import { and, desc, eq, gt, isNotNull, isNull, sql } from 'drizzle-orm';
import { getActiveServerId } from '@/lib/game/servers';

import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { withTimeout } from '@/lib/db/with-timeout';
import { mailbox } from '@/lib/db/schema/mailbox';

import { MailList, type MailItem } from './MailList';

const PAGE_SIZE = 50;

/**
 * 우편함 — docs/MAIL.md. 미수령(미만료) + 받은(claimed) 두 탭.
 * 만료된 미수령은 노출 X(lazy 처리). cron은 v2.
 */
export default async function MailPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const userId = await getSessionUserId();
  const serverId = await getActiveServerId();
  if (!userId) return null;
  const tab = (await searchParams).tab === 'done' ? 'done' : 'unread';

  // 콜드 DB 커넥션 hang 시 페이지 무한 대기 방지 — 실패 시 빈 목록으로 degrade(2026-05-29).
  // PAGE_SIZE+1 fetch → '더 보기' 활성 여부 판정(hasMore).
  const rows = await withTimeout(
    db
      .select({
        id: mailbox.id,
        type: mailbox.type,
        title: mailbox.title,
        body: mailbox.body,
        senderLabel: mailbox.senderLabel,
        payload: mailbox.payload,
        claimedAt: mailbox.claimedAt,
        expiresAt: mailbox.expiresAt,
        createdAt: mailbox.createdAt,
      })
      .from(mailbox)
      .where(
        tab === 'unread'
          ? and(
              eq(mailbox.userId, userId),
              eq(mailbox.serverId, serverId),
              isNull(mailbox.claimedAt),
              gt(mailbox.expiresAt, sql`now()`),
            )
          : and(
              eq(mailbox.userId, userId),
              eq(mailbox.serverId, serverId),
              isNotNull(mailbox.claimedAt),
            ),
      )
      .orderBy(desc(mailbox.createdAt))
      .limit(PAGE_SIZE + 1),
    3500,
    'mail.page',
  ).catch(() => []);

  const hasMore = rows.length > PAGE_SIZE;
  const pageRows = rows.slice(0, PAGE_SIZE);

  const items: MailItem[] = pageRows.map((r) => ({
    id: r.id.toString(),
    type: r.type,
    title: r.title || defaultTitle(r.type),
    body: r.body || '',
    senderLabel: r.senderLabel,
    payload: r.payload as MailItem['payload'],
    claimedAtIso: r.claimedAt ? r.claimedAt.toISOString() : null,
    expiresAtIso: r.expiresAt.toISOString(),
    createdAtIso: r.createdAt.toISOString(),
  }));

  // unread 탭 — 미수령 **전체**의 합계 + 건수(서버 권위). 모두 받기 미리보기 정확도용.
  // 표시된 PAGE_SIZE 항목으로 계산한 클라이언트 합계는 더 이상 사용 안 함.
  const unreadTotals =
    tab === 'unread'
      ? await withTimeout(
          db.execute(sql`
            select
              count(*)::int as cnt,
              coalesce(sum((payload->>'diamond')::bigint), 0)::bigint as diamond,
              coalesce(sum((payload->'boxes'->>'weapon')::int),    0)::int as weapon,
              coalesce(sum((payload->'boxes'->>'armor')::int),     0)::int as armor,
              coalesce(sum((payload->'boxes'->>'accessory')::int), 0)::int as accessory
            from mailbox
            where user_id = ${userId}::uuid
              and server_id = ${serverId}
              and claimed_at is null
              and expires_at > now()
          `),
          2500,
          'mail.totals',
        ).catch(() => null)
      : null;
  const totalsRow = unreadTotals
    ? (unreadTotals as unknown as {
        cnt: number;
        diamond: string | bigint;
        weapon: number;
        armor: number;
        accessory: number;
      }[])[0]
    : null;
  const unreadAggregate =
    tab === 'unread' && totalsRow
      ? {
          count: Number(totalsRow.cnt ?? 0),
          diamond: Number(totalsRow.diamond ?? 0),
          boxes: {
            weapon: Number(totalsRow.weapon ?? 0),
            armor: Number(totalsRow.armor ?? 0),
            accessory: Number(totalsRow.accessory ?? 0),
          },
        }
      : null;

  return (
    <MailList
      items={items}
      tab={tab}
      unreadCount={unreadAggregate?.count ?? (tab === 'unread' ? items.length : null)}
      hasMore={hasMore}
      unreadAggregate={unreadAggregate}
    />
  );
}

function defaultTitle(type: string): string {
  // mail type별 폴백 타이틀(제목 없을 때 안전망).
  switch (type) {
    case 'admin':
      return '인생강화 메시지';
    case 'reward':
      return '보상이 도착했습니다';
    case 'profile_accepted':
      return '아바타가 승인되었습니다';
    case 'profile_rejected_ai':
      return '아바타 검토 결과';
    case 'profile_failed':
      return '아바타 처리 실패';
    case 'notice':
      return '공지';
    case 'melee':
      return '대난투 결과';
    case 'conquest':
      return '점령전 결과';
    case 'guild':
      return '길드 알림';
    default:
      return '우편';
  }
}
