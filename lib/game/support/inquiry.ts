import 'server-only';

import { and, desc, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { supportInquiries } from '@/lib/db/schema/support';
import { mailbox } from '@/lib/db/schema/mailbox';
import { characters } from '@/lib/db/schema/server';
import { profiles } from '@/lib/db/schema/profiles';
import { sendPushToUser } from '@/lib/push/send';

import { INQUIRY_LABEL, ANSWER_MAX, BODY_MAX, type InquiryType } from './types';

/**
 * 문의 접수 — 저장 + 접수 안내 우편(운영자 발신). 푸시는 없음(사용자 결정).
 * 접수 시점 닉네임·#코드를 스냅샷으로 저장(닉 변경돼도 관리자 식별).
 */
export async function submitInquiry(input: {
  userId: string;
  serverId: number;
  type: InquiryType;
  body: string;
}): Promise<{ id: bigint }> {
  const body = input.body.trim().slice(0, BODY_MAX);
  const [who] = await db
    .select({ nickname: characters.nickname, code: profiles.publicCode })
    .from(profiles)
    .leftJoin(
      characters,
      and(eq(characters.userId, profiles.id), eq(characters.serverId, input.serverId)),
    )
    .where(eq(profiles.id, input.userId))
    .limit(1);
  const snapshot = { nickname: who?.nickname ?? null, code: who?.code ?? null };
  const label = INQUIRY_LABEL[input.type] ?? input.type;

  const [row] = await db
    .insert(supportInquiries)
    .values({
      userId: input.userId,
      serverId: input.serverId,
      type: input.type,
      body,
      contextSnapshot: snapshot,
    })
    .returning({ id: supportInquiries.id });

  // 접수 안내 우편(운영자, 푸시 없음).
  await db.insert(mailbox).values({
    userId: input.userId,
    serverId: input.serverId,
    type: 'admin',
    title: '문의가 접수되었어요',
    body: `${label}가 정상 접수되었습니다.\n담당자가 확인 후 답변을 우편으로 보내드릴게요.\n\n■ 접수 내용\n${body}`,
    senderLabel: '운영자',
    payload: {},
  });

  return { id: row!.id };
}

/**
 * 관리자 답변 — open→answered 멱등 전이 + 답변 우편(운영자) + 앱 푸시(category 'admin', 항상 발송).
 * 이미 답변됐거나 없는 건은 no-op(reason 반환).
 */
export async function answerInquiry(input: {
  inquiryId: bigint;
  adminUserId: string;
  answer: string;
}): Promise<{ ok: boolean; reason?: 'EMPTY' | 'ALREADY_OR_NOT_FOUND' }> {
  const answer = input.answer.trim().slice(0, ANSWER_MAX);
  if (answer.length < 2) return { ok: false, reason: 'EMPTY' };

  const done = await db.transaction(async (tx) => {
    const [inq] = await tx
      .select({
        userId: supportInquiries.userId,
        serverId: supportInquiries.serverId,
        type: supportInquiries.type,
        body: supportInquiries.body,
      })
      .from(supportInquiries)
      .where(eq(supportInquiries.id, input.inquiryId))
      .for('update');
    if (!inq) return null;

    // 멱등: open일 때만 전이(0행이면 이미 답변됨 — 이중 우편/푸시 방지).
    const claimed = await tx
      .update(supportInquiries)
      .set({
        status: 'answered',
        answerBody: answer,
        answeredByUserId: input.adminUserId,
        answeredAt: sql`now()`,
      })
      .where(and(eq(supportInquiries.id, input.inquiryId), eq(supportInquiries.status, 'open')))
      .returning({ id: supportInquiries.id });
    if (claimed.length === 0) return null;

    const label = INQUIRY_LABEL[inq.type] ?? inq.type;
    await tx.insert(mailbox).values({
      userId: inq.userId,
      serverId: inq.serverId,
      type: 'admin',
      title: '문의 답변이 도착했어요',
      body: `${label}에 대한 답변입니다.\n\n${answer}\n\n────────\n■ 보내신 문의\n${inq.body}`,
      senderLabel: '운영자',
      payload: {},
    });
    return { userId: inq.userId };
  });

  if (!done) return { ok: false, reason: 'ALREADY_OR_NOT_FOUND' };

  // 앱 푸시(트랜잭션 밖, best-effort — 실패해도 우편은 이미 전달됨).
  try {
    await sendPushToUser(done.userId, {
      title: '문의 답변 도착',
      body: '고객센터 답변이 우편함에 도착했어요.',
      url: '/mail',
      category: 'admin',
    });
  } catch {
    /* best-effort */
  }
  return { ok: true };
}

/** 관리자 목록 — 상태 필터(open/answered/all) + 서버 필터, 최신순. */
export async function listInquiries(
  status: 'open' | 'answered' | 'all',
  serverId: number | null,
  limit = 100,
) {
  const conds = [];
  if (status !== 'all') conds.push(eq(supportInquiries.status, status));
  if (serverId != null) conds.push(eq(supportInquiries.serverId, serverId));
  return db
    .select()
    .from(supportInquiries)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(supportInquiries.createdAt))
    .limit(limit);
}

/**
 * 관리자 문의 삭제 — 답변 없이 종결할 문의(스팸·테스트·중복 등) 정리용. 하드 삭제.
 * 유저에게 통지 없음(답변이 필요한 건은 answerInquiry 사용).
 */
export async function deleteInquiry(inquiryId: bigint): Promise<boolean> {
  const rows = await db
    .delete(supportInquiries)
    .where(eq(supportInquiries.id, inquiryId))
    .returning({ id: supportInquiries.id });
  return rows.length > 0;
}

/** 관리자 카운트(미답변 배지용). */
export async function countOpenInquiries(serverId: number | null): Promise<number> {
  const conds = [eq(supportInquiries.status, 'open')];
  if (serverId != null) conds.push(eq(supportInquiries.serverId, serverId));
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(supportInquiries)
    .where(and(...conds));
  return r?.n ?? 0;
}
