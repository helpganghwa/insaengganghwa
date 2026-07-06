import 'server-only';

import { unstable_cache } from 'next/cache';
import { desc, eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { announcements } from '@/lib/db/schema/announcement';

import type { AnnouncementView } from './announcement-shared';

// 상수·타입은 클라 공용 모듈에서(서버 소비자도 여기로 재노출). 클라 컴포넌트는 announcement-shared 직접 import.
export * from './announcement-shared';

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

/**
 * 게시판/홈 — 발행된 공지 최신순(고정 상단 정렬은 클라에서).
 * §11.5 — 홈 로드마다 조회되는 준불변 데이터라 30초 캐시(공지 발행 지연 ≤30s 허용).
 */
export const listPublishedAnnouncements = unstable_cache(
  async (limit = 30): Promise<AnnouncementView[]> => {
    const rows = await db
      .select()
      .from(announcements)
      .where(eq(announcements.published, true))
      .orderBy(desc(announcements.publishedAt), desc(announcements.id))
      .limit(limit);
    return rows.map(toView);
  },
  ['published-announcements-v1'],
  { revalidate: 30, tags: ['announcements'] },
);

/** 어드민 — 전체(초안 포함) 최신순. */
export async function listAllAnnouncements(limit = 100): Promise<AnnouncementView[]> {
  const rows = await db.select().from(announcements).orderBy(desc(announcements.id)).limit(limit);
  return rows.map(toView);
}
