'use server';

import { revalidateTag } from 'next/cache';

import { safeBigInt } from '@/lib/util/id';
import { eq, sql } from 'drizzle-orm';

import { requireAdmin } from '@/lib/auth/require-admin';
import { createSupabaseServiceClient } from '@/lib/auth/supabase-server';
import { db } from '@/lib/db/client';
import { announcements } from '@/lib/db/schema/announcement';
import { ANNOUNCEMENT_CATEGORIES, getPollResults, type PollResults } from '@/lib/game/announcement';
import type { AnnouncementPoll } from '@/lib/game/announcement-shared';
import { kstLocalInputToIso } from '@/lib/kst';

type SaveInput = {
  id?: string;
  category: string;
  title: string;
  body: string;
  pinned: boolean;
  publish: boolean;
  /** 대상 서버(2026-08-07) — null/미지정=전서버. */
  serverId?: number | null;
  /** 투표(선택) — null/미지정이면 투표 없음. */
  poll?: AnnouncementPoll | null;
  /**
   * 예약 발행(0158) — ISO 또는 `YYYY-MM-DDTHH:mm`(datetime-local). 후자는 **KST 벽시계**로
   * 해석한다(운영자가 KST로 입력·확인한다는 전제 — 브라우저 타임존에 결과가 좌우되지 않게).
   * 빈 문자열/null이면 예약 해제.
   */
  scheduledAt?: string | null;
};
type Result = { status: 'success' } | { status: 'error'; message: string };

/** 투표 입력 정규화·검증 — 질문·보기 2개 이상·라벨/ID 유효. 무효면 문자열(에러) 반환. */
function normalizePoll(poll: AnnouncementPoll | null | undefined): AnnouncementPoll | null | string {
  if (!poll) return null;
  const question = (poll.question ?? '').trim();
  const options = (poll.options ?? [])
    .map((o) => ({ id: String(o.id ?? '').trim(), label: String(o.label ?? '').trim() }))
    .filter((o) => o.label);
  if (!question) return '투표 질문을 입력하세요.';
  if (options.length < 2) return '투표 보기를 2개 이상 입력하세요.';
  const ids = new Set(options.map((o) => o.id));
  if (ids.size !== options.length || ids.has('')) return '투표 보기 ID가 유효하지 않습니다.';
  let closesAtIso: string | null = null;
  if (poll.closesAtIso) {
    const t = Date.parse(poll.closesAtIso);
    if (Number.isNaN(t)) return '마감일이 유효하지 않습니다.';
    closesAtIso = new Date(t).toISOString();
  }
  return { question, options, closesAtIso };
}

/** 예약 시각 정규화 — 빈 값=해제(null), 파싱 실패는 문자열(에러) 반환. */
function normalizeScheduledAt(raw: string | null | undefined): Date | null | string {
  const v = (raw ?? '').trim();
  if (!v) return null;
  // datetime-local(타임존 없음)은 KST로 못박고, 그 외는 ISO로 해석.
  const iso = kstLocalInputToIso(v) ?? v;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '예약 발행 시각이 유효하지 않습니다.';
  return new Date(t);
}

/** 공지 생성/수정 — 발행 시 published_at은 최초 1회 now()(재편집해도 유지). */
export async function saveAnnouncementAction(input: SaveInput): Promise<Result> {
  await requireAdmin();
  const title = input.title.trim();
  const body = input.body.trim();
  const category = (ANNOUNCEMENT_CATEGORIES as readonly string[]).includes(input.category)
    ? input.category
    : 'notice';
  if (!title) return { status: 'error', message: '제목을 입력하세요.' };
  if (!body) return { status: 'error', message: '내용을 입력하세요.' };
  const poll = normalizePoll(input.poll);
  if (typeof poll === 'string') return { status: 'error', message: poll };
  const scheduled = normalizeScheduledAt(input.scheduledAt);
  if (typeof scheduled === 'string') return { status: 'error', message: scheduled };
  // 발행 저장이면 예약은 무의미 — 함께 지운다(이미 발행된 글에 예약이 남으면 목록에서 혼선).
  const scheduledAt = input.publish ? null : scheduled;
  const serverId =
    Number.isInteger(input.serverId) && (input.serverId as number) >= 1 && (input.serverId as number) <= 32767
      ? (input.serverId as number)
      : null; // null=전서버

  if (input.id) {
    const aid = safeBigInt(input.id);
    if (aid === null) return { status: 'error', message: '잘못된 공지 ID입니다.' };
    await db
      .update(announcements)
      .set({
        category,
        title,
        body,
        serverId,
        pinned: input.pinned,
        published: input.publish,
        poll,
        scheduledAt,
        // 발행이면 기존 발행시각 유지(없으면 now()), 미발행이면 그대로 둠.
        publishedAt: input.publish
          ? sql`coalesce(${announcements.publishedAt}, now())`
          : announcements.publishedAt,
        updatedAt: sql`now()`,
      })
      .where(eq(announcements.id, aid));
  } else {
    await db.insert(announcements).values({
      category,
      title,
      body,
      serverId,
      pinned: input.pinned,
      published: input.publish,
      poll,
      scheduledAt,
      publishedAt: input.publish ? sql`now()` : null,
    });
  }
  // 편집 즉시 반영 — 30s 캐시(tags:['announcements'])를 기다리지 않게 무효화.
  revalidateTag('announcements', 'max');
  return { status: 'success' };
}

/**
 * 공지 이미지 버킷 — **public**(공지 본문 이미지는 모든 유저가 봐야 하므로 signed URL이 무의미).
 * 문의 첨부(inquiry-attachments)가 private인 것과 정반대 이유 — 저기엔 결제내역·개인정보가 섞인다.
 */
const ANNOUNCEMENT_BUCKET = 'announcement-images';
// ⚠ Vercel 함수 요청 바디 한도(~4.5MB)가 실질 천장 — 그 위는 액션에 닿기 전에 플랫폼이 끊는다
// (클라에서 예외로 잡아 같은 문구를 띄운다). 공지 이미지는 그보다 훨씬 작게 쓰는 게 정상.
const IMAGE_MAX_BYTES = 3 * 1024 * 1024;
const IMAGE_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

type UploadResult = { status: 'success'; url: string } | { status: 'error'; message: string };

/**
 * 공지 본문 이미지 업로드 — 성공 시 public URL 반환(어드민이 `![](URL)`로 본문에 삽입).
 * 파일명은 UUID 고정(원본명은 한글·공백·확장자 위장이 섞여 URL·스토리지 키를 오염시킨다).
 * 실패는 문구로 반환 — 어드민 편집 중 500 페이지로 튀면 작성 중인 본문이 날아간다.
 */
export async function uploadAnnouncementImageAction(formData: FormData): Promise<UploadResult> {
  await requireAdmin();
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return { status: 'error', message: '이미지를 선택하세요.' };
  const ext = IMAGE_TYPES[file.type];
  if (!ext) return { status: 'error', message: '이미지 파일(PNG/JPEG/WebP/GIF)만 첨부할 수 있어요.' };
  if (file.size > IMAGE_MAX_BYTES) return { status: 'error', message: '이미지는 3MB 이하만 첨부할 수 있어요.' };

  try {
    const supabase = createSupabaseServiceClient();
    // 버킷 멱등 생성 — 이미 있으면 에러가 나므로 무시(inquiry와 동일 패턴).
    await supabase.storage.createBucket(ANNOUNCEMENT_BUCKET, { public: true }).catch(() => {});
    const path = `${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage
      .from(ANNOUNCEMENT_BUCKET)
      .upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false });
    if (error) {
      console.error('[announcement] image upload', error.message);
      return { status: 'error', message: '업로드에 실패했어요. 잠시 후 다시 시도해 주세요.' };
    }
    const { data } = supabase.storage.from(ANNOUNCEMENT_BUCKET).getPublicUrl(path);
    return { status: 'success', url: data.publicUrl };
  } catch (e) {
    console.error('[announcement] image upload', (e as Error).message);
    return { status: 'error', message: '업로드에 실패했어요. 잠시 후 다시 시도해 주세요.' };
  }
}

/** 어드민 — 투표 결과 + 투표자 목록(비익명). 관리자만. */
export async function getPollResultsAction(
  id: string,
): Promise<{ status: 'success'; data: PollResults } | { status: 'error'; message: string }> {
  await requireAdmin();
  const aid = safeBigInt(id);
  if (aid === null) return { status: 'error', message: '잘못된 공지 ID입니다.' };
  return { status: 'success', data: await getPollResults(aid) };
}

export async function deleteAnnouncementAction(id: string): Promise<Result> {
  await requireAdmin();
  const aid = safeBigInt(id);
  if (aid === null) return { status: 'error', message: '잘못된 공지 ID입니다.' };
  await db.delete(announcements).where(eq(announcements.id, aid));
  revalidateTag('announcements', 'max');
  return { status: 'success' };
}
