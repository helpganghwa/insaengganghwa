'use server';

import { revalidatePath } from 'next/cache';
import { and, desc, eq, gt, isNotNull, isNull, lt, sql } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { getActiveServerId } from '@/lib/game/servers';
import { db } from '@/lib/db/client';
import { mailbox } from '@/lib/db/schema/mailbox';
import { rateLimited } from '@/lib/ratelimit';
import {
  claimMail,
  claimAllMail,
  MailError,
  type ClaimResult,
} from '@/lib/game/mailbox';
import type { MailItem } from './MailList';

type ErrorState = { status: 'error'; code: string; message: string };

const MSG: Record<string, string> = {
  MAIL_NOT_FOUND: '이미 수령했거나 만료된 우편입니다.',
  UNAUTHENTICATED: '로그인이 필요합니다.',
  RATE_LIMITED: '요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.',
  UNKNOWN: '알 수 없는 오류',
};

function err(code: string): ErrorState {
  return { status: 'error', code, message: MSG[code] ?? code };
}

function revalidate() {
  revalidatePath('/mail');
  revalidatePath('/'); // 헤더 배지 카운트
}

async function uid(): Promise<string | null> {
  return getSessionUserId();
}

export async function claimMailAction(
  mailId: string,
): Promise<{ status: 'success'; result: ClaimResult } | ErrorState> {
  const userId = await uid();
  if (!userId) return err('UNAUTHENTICATED');
  if (await rateLimited(userId, 'mail')) return err('RATE_LIMITED');
  try {
    const result = await claimMail({ userId, serverId: await getActiveServerId(), mailId: BigInt(mailId) });
    revalidate();
    return { status: 'success', result };
  } catch (e) {
    if (e instanceof MailError) return err(e.code);
    console.error('[mail.claim]', e);
    return err('UNKNOWN');
  }
}

/** 미수령(미만료) 우편 — 헤더 팝업용 fetch action. 최대 50건. */
export async function getUnreadMailsAction(): Promise<MailItem[]> {
  const userId = await uid();
  if (!userId) return [];
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
      and(
        eq(mailbox.userId, userId),
        eq(mailbox.serverId, await getActiveServerId()),
        isNull(mailbox.claimedAt),
        gt(mailbox.expiresAt, sql`now()`),
      ),
    )
    .orderBy(desc(mailbox.createdAt))
    .limit(50);
  return rows.map((r) => ({
    id: r.id.toString(),
    type: r.type,
    title: r.title || (r.type === 'admin' ? '운영자 메시지' : '우편'),
    body: r.body || '',
    senderLabel: r.senderLabel,
    payload: r.payload as MailItem['payload'],
    claimedAtIso: r.claimedAt ? r.claimedAt.toISOString() : null,
    expiresAtIso: r.expiresAt.toISOString(),
    createdAtIso: r.createdAt.toISOString(),
  }));
}

/**
 * "더 보기" — 현재 표시된 우편 중 가장 오래된 row 이전의 50건. tab별 동일 필터.
 * 첫 PAGE_SIZE+1로 fetch해서 hasMore 판정.
 */
const PAGE_SIZE = 50;
export async function loadMoreMailsAction(
  tab: 'unread' | 'done',
  beforeCreatedAtIso: string,
): Promise<{ status: 'success'; items: MailItem[]; hasMore: boolean } | ErrorState> {
  const userId = await uid();
  if (!userId) return err('UNAUTHENTICATED');
  let before: Date;
  try {
    before = new Date(beforeCreatedAtIso);
    if (Number.isNaN(before.getTime())) throw new Error('invalid date');
  } catch {
    return err('UNKNOWN');
  }
  const tabClause =
    tab === 'unread'
      ? and(isNull(mailbox.claimedAt), gt(mailbox.expiresAt, sql`now()`))
      : isNotNull(mailbox.claimedAt);
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
      and(
        eq(mailbox.userId, userId),
        eq(mailbox.serverId, await getActiveServerId()),
        tabClause,
        lt(mailbox.createdAt, before),
      ),
    )
    .orderBy(desc(mailbox.createdAt))
    .limit(PAGE_SIZE + 1);
  const hasMore = rows.length > PAGE_SIZE;
  const items: MailItem[] = rows.slice(0, PAGE_SIZE).map((r) => ({
    id: r.id.toString(),
    type: r.type,
    title: r.title || (r.type === 'admin' ? '운영자 메시지' : '우편'),
    body: r.body || '',
    senderLabel: r.senderLabel,
    payload: r.payload as MailItem['payload'],
    claimedAtIso: r.claimedAt ? r.claimedAt.toISOString() : null,
    expiresAtIso: r.expiresAt.toISOString(),
    createdAtIso: r.createdAt.toISOString(),
  }));
  return { status: 'success', items, hasMore };
}

export async function claimAllMailAction(): Promise<
  { status: 'success'; result: ClaimResult } | ErrorState
> {
  const userId = await uid();
  if (!userId) return err('UNAUTHENTICATED');
  if (await rateLimited(userId, 'mail')) return err('RATE_LIMITED');
  try {
    const result = await claimAllMail({ userId, serverId: await getActiveServerId() });
    revalidate();
    return { status: 'success', result };
  } catch (e) {
    if (e instanceof MailError) return err(e.code);
    console.error('[mail.claimAll]', e);
    return err('UNKNOWN');
  }
}
