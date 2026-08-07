'use server';

import { revalidateTag } from 'next/cache';

import { safeBigInt } from '@/lib/util/id';
import { eq, sql } from 'drizzle-orm';

import { requireAdmin } from '@/lib/auth/require-admin';
import { db } from '@/lib/db/client';
import { announcements } from '@/lib/db/schema/announcement';
import { ANNOUNCEMENT_CATEGORIES, getPollResults, type PollResults } from '@/lib/game/announcement';
import type { AnnouncementPoll } from '@/lib/game/announcement-shared';

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
      publishedAt: input.publish ? sql`now()` : null,
    });
  }
  // 편집 즉시 반영 — 30s 캐시(tags:['announcements'])를 기다리지 않게 무효화.
  revalidateTag('announcements', 'max');
  return { status: 'success' };
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
