'use server';

import { eq, sql } from 'drizzle-orm';

import { requireAdmin } from '@/lib/auth/require-admin';
import { db } from '@/lib/db/client';
import { announcements } from '@/lib/db/schema/announcement';
import { ANNOUNCEMENT_CATEGORIES } from '@/lib/game/announcement';

type SaveInput = {
  id?: string;
  category: string;
  title: string;
  body: string;
  pinned: boolean;
  publish: boolean;
};
type Result = { status: 'success' } | { status: 'error'; message: string };

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

  if (input.id) {
    await db
      .update(announcements)
      .set({
        category,
        title,
        body,
        pinned: input.pinned,
        published: input.publish,
        // 발행이면 기존 발행시각 유지(없으면 now()), 미발행이면 그대로 둠.
        publishedAt: input.publish
          ? sql`coalesce(${announcements.publishedAt}, now())`
          : announcements.publishedAt,
        updatedAt: sql`now()`,
      })
      .where(eq(announcements.id, BigInt(input.id)));
  } else {
    await db.insert(announcements).values({
      category,
      title,
      body,
      pinned: input.pinned,
      published: input.publish,
      publishedAt: input.publish ? sql`now()` : null,
    });
  }
  return { status: 'success' };
}

export async function deleteAnnouncementAction(id: string): Promise<Result> {
  await requireAdmin();
  await db.delete(announcements).where(eq(announcements.id, BigInt(id)));
  return { status: 'success' };
}
