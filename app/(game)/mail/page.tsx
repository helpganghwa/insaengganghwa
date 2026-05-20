import { and, desc, eq, gt, isNotNull, isNull, sql } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
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

  const rows = await db
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
    .limit(PAGE_SIZE);

  const items: MailItem[] = rows.map((r) => ({
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

  return <MailList items={items} tab={tab} unreadCount={tab === 'unread' ? items.length : null} />;
}

function defaultTitle(type: string): string {
  switch (type) {
    case 'admin':
      return '운영자 메시지';
    case 'reward':
      return '보상이 도착했습니다';
    case 'notice':
      return '공지';
    case 'raid_settlement':
      return '레이드 정산';
    case 'enhance_result':
      return '강화 결과';
    default:
      return '우편';
  }
}
