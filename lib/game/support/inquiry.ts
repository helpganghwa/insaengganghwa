import 'server-only';

import { and, desc, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { supportInquiries } from '@/lib/db/schema/support';
import { mailbox } from '@/lib/db/schema/mailbox';
import { characters } from '@/lib/db/schema/server';
import { profiles } from '@/lib/db/schema/profiles';
import { sendPushToUser } from '@/lib/push/send';
import { createSupabaseServiceClient } from '@/lib/auth/supabase-server';

import { INQUIRY_LABEL, ANSWER_MAX, BODY_MAX, type InquiryType } from './types';

/**
 * 첨부 이미지 버킷(0116) — **private**(문의 스크린샷엔 결제내역·개인정보가 흔함).
 * 어드민 열람은 signed URL(1h). 경로 = {userId}/{uuid}.jpg — 탈퇴 시 폴더째 정리.
 */
export const INQUIRY_BUCKET = 'inquiry-attachments';

/** 첨부 업로드(버킷 멱등 생성) — 업로드된 경로 반환. 실패 시 부분 업로드 정리 후 throw. */
export async function uploadInquiryImages(
  userId: string,
  files: { bytes: Buffer; contentType: string }[],
): Promise<string[]> {
  const supabase = createSupabaseServiceClient();
  await supabase.storage.createBucket(INQUIRY_BUCKET, { public: false }).catch(() => {});
  const paths: string[] = [];
  for (const f of files) {
    const path = `${userId}/${crypto.randomUUID()}.jpg`;
    const { error } = await supabase.storage
      .from(INQUIRY_BUCKET)
      .upload(path, f.bytes, { contentType: f.contentType, upsert: false });
    if (error) {
      await removeInquiryImages(paths); // 부분 업로드 정리(고아 방지)
      throw new Error(`inquiry upload: ${error.message}`);
    }
    paths.push(path);
  }
  return paths;
}

/** 첨부 삭제(best-effort) — 문의 삭제·접수 실패 롤백·탈퇴 정리에서 사용. */
export async function removeInquiryImages(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  try {
    await createSupabaseServiceClient().storage.from(INQUIRY_BUCKET).remove(paths);
  } catch {
    /* best-effort — 남아도 private 버킷이라 노출 없음 */
  }
}

/** 어드민 열람용 signed URL(1h) — private 버킷이라 직접 URL 없음. 실패 항목은 null. */
export async function signInquiryImageUrls(paths: string[]): Promise<(string | null)[]> {
  if (paths.length === 0) return [];
  const { data, error } = await createSupabaseServiceClient()
    .storage.from(INQUIRY_BUCKET)
    .createSignedUrls(paths, 3600);
  if (error || !data) return paths.map(() => null);
  return data.map((d) => d.signedUrl ?? null);
}

/** 탈퇴 정리 — 해당 유저 첨부 폴더 삭제(행은 CASCADE, 파일은 여기서). best-effort. */
export async function removeAllInquiryImagesForUser(userId: string): Promise<void> {
  try {
    const supabase = createSupabaseServiceClient();
    const { data } = await supabase.storage.from(INQUIRY_BUCKET).list(userId, { limit: 100 });
    if (data?.length) {
      await supabase.storage.from(INQUIRY_BUCKET).remove(data.map((f) => `${userId}/${f.name}`));
    }
  } catch {
    /* best-effort */
  }
}

/**
 * 문의 접수 — 저장 + 접수 안내 우편(운영자 발신). 푸시는 없음(사용자 결정).
 * 접수 시점 닉네임·#코드를 스냅샷으로 저장(닉 변경돼도 관리자 식별).
 */
export async function submitInquiry(input: {
  userId: string;
  serverId: number;
  type: InquiryType;
  body: string;
  /** 첨부 이미지 스토리지 경로(uploadInquiryImages 결과, ≤3). */
  imagePaths?: string[];
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
      imagePaths: input.imagePaths ?? [],
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
export type AnswerReward = { diamond: number; boxes: { weapon: number; armor: number; accessory: number } };

/** 보상 첨부 정규화 — 음수/NaN 방어 + 상한(다이아 10만·상자 슬롯당 1,000). 전부 0이면 null. */
function normReward(r?: AnswerReward | null): AnswerReward | null {
  if (!r) return null;
  const clamp = (v: unknown, max: number) => Math.min(max, Math.max(0, Math.floor(Number(v) || 0)));
  const out = {
    diamond: clamp(r.diamond, 100_000),
    boxes: {
      weapon: clamp(r.boxes?.weapon, 1_000),
      armor: clamp(r.boxes?.armor, 1_000),
      accessory: clamp(r.boxes?.accessory, 1_000),
    },
  };
  const any = out.diamond > 0 || out.boxes.weapon > 0 || out.boxes.armor > 0 || out.boxes.accessory > 0;
  return any ? out : null;
}

export async function answerInquiry(input: {
  inquiryId: bigint;
  adminUserId: string;
  answer: string;
  /** 답변에 첨부할 보상(0128 개선) — 우편 payload로 실려 유저가 수령. */
  reward?: AnswerReward | null;
}): Promise<{ ok: boolean; reason?: 'EMPTY' | 'ALREADY_OR_NOT_FOUND' }> {
  const answer = input.answer.trim().slice(0, ANSWER_MAX);
  if (answer.length < 2) return { ok: false, reason: 'EMPTY' };
  const reward = normReward(input.reward);

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
      // 보상 첨부 시 수령형 우편(payload 기반 — MailList hasPayload) — 없으면 안내문만.
      payload: reward ?? {},
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
    .returning({ id: supportInquiries.id, imagePaths: supportInquiries.imagePaths });
  if (rows.length === 0) return false;
  await removeInquiryImages(rows[0]!.imagePaths ?? []); // 첨부 파일도 정리(best-effort)
  return true;
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
