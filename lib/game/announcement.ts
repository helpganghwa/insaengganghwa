import 'server-only';

import { desc, eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { announcements } from '@/lib/db/schema/announcement';

export const ANNOUNCEMENT_CATEGORIES = [
  'notice',
  'maintenance',
  'update',
  'event',
  'policy',
  'probability',
] as const;
export type AnnouncementCategory = (typeof ANNOUNCEMENT_CATEGORIES)[number];

export const ANNOUNCEMENT_CATEGORY_LABEL: Record<string, string> = {
  notice: '공지',
  maintenance: '점검',
  update: '업데이트',
  event: '이벤트',
  policy: '정책',
  probability: '확률',
};

export type AnnouncementView = {
  id: string;
  category: string;
  title: string;
  body: string;
  pinned: boolean;
  publishedAtIso: string | null;
};

function toView(r: typeof announcements.$inferSelect): AnnouncementView {
  return {
    id: r.id.toString(),
    category: r.category,
    title: r.title,
    body: r.body,
    pinned: r.pinned,
    publishedAtIso: r.publishedAt ? r.publishedAt.toISOString() : null,
  };
}

/** 게시판/홈 — 발행된 공지 최신순(고정 상단 정렬은 클라에서). */
export async function listPublishedAnnouncements(limit = 30): Promise<AnnouncementView[]> {
  const rows = await db
    .select()
    .from(announcements)
    .where(eq(announcements.published, true))
    .orderBy(desc(announcements.publishedAt), desc(announcements.id))
    .limit(limit);
  return rows.map(toView);
}

/** 어드민 — 전체(초안 포함) 최신순. */
export async function listAllAnnouncements(limit = 100): Promise<AnnouncementView[]> {
  const rows = await db.select().from(announcements).orderBy(desc(announcements.id)).limit(limit);
  return rows.map(toView);
}
