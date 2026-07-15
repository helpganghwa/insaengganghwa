import type { MetadataRoute } from 'next';

import { desc } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { profiles } from '@/lib/db/schema/profiles';

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://ganghwa.app';

// 일 1회 재생성(ISR) — 신규 공개 프로필이 재배포 없이도 사이트맵에 반영되게(요청당 DB히트는 없음).
export const revalidate = 86400;

/**
 * sitemap — 공개 페이지(랜딩·확률공시·가격·법적고지) + 공개 프로필(/u, 롱테일 인덱싱).
 * 프로필은 불변 public_code로. DB 지연/실패 시 정적분만으로도 유효(try/catch).
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${SITE}/login`, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE}/guide`, lastModified: now, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${SITE}/probability`, lastModified: now, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${SITE}/pricing`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    ...(['terms', 'privacy', 'refund', 'youth'] as const).map((d) => ({
      url: `${SITE}/legal/${d}`,
      lastModified: now,
      changeFrequency: 'yearly' as const,
      priority: 0.3,
    })),
  ];

  let profileEntries: MetadataRoute.Sitemap = [];
  try {
    const rows = await db
      .select({ code: profiles.publicCode })
      .from(profiles)
      .orderBy(desc(profiles.createdAt))
      .limit(2000);
    profileEntries = rows.map((r) => ({
      url: `${SITE}/u/${r.code}`,
      changeFrequency: 'daily' as const,
      priority: 0.5,
    }));
  } catch {
    // 사이트맵은 정적분만으로도 유효 — DB 실패해도 200.
  }

  return [...staticEntries, ...profileEntries];
}
