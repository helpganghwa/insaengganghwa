import { and, desc, eq, gt, isNotNull, isNull, sql } from 'drizzle-orm';

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
          ? and(eq(mailbox.userId, userId), isNull(mailbox.claimedAt), gt(mailbox.expiresAt, sql`now()`))
          : and(eq(mailbox.userId, userId), isNotNull(mailbox.claimedAt)),
      )
      .orderBy(desc(mailbox.createdAt))
      .limit(PAGE_SIZE + 1),
    3500,
    'mail.page',
  ).catch(() => []);

  const hasMore = rows.length > PAGE_SIZE;
  const items: MailItem[] = rows.slice(0, PAGE_SIZE).map((r) => ({
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

  return (
    <MailList
      items={items}
      tab={tab}
      unreadCount={tab === 'unread' ? items.length : null}
      hasMore={hasMore}
    />
  );
}

function defaultTitle(type: string): string {
  // 실사용 mail type 폴백 타이틀. notice/raid_settlement/enhance_result는 enum에만
  // 존재하고 실제 insert 경로 없음(2026-06-01 확인) — fallback 안전망.
  switch (type) {
    case 'admin':
      return '운영자 메시지';
    case 'reward':
      return '보상이 도착했습니다';
    case 'profile_accepted':
      return '프로필이 승인되었습니다';
    case 'profile_rejected_ai':
      return '프로필 검토 결과';
    case 'profile_failed':
      return '프로필 처리 실패';
    case 'notice':
      return '공지';
    default:
      return '우편';
  }
}
