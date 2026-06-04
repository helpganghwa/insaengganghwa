import 'server-only';

import { cache } from 'react';
import { eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { userCodex } from '@/lib/db/schema/equipment';

/**
 * 계정 '최고 도달' — 단일 최고 아이템의 lifetime 레벨(배틀패스 진행 입력).
 *
 * 강화/초월 모두 user_codex에 카탈로그별 역대 최고가 단조 유지되므로(분해·제물 소모·강화
 * 하락과 무관), 계정 최고 = MAX 집계. PK(user_id, catalog_item_id) 인덱스 위 작은 테이블
 * 집계라 비용 무시 가능. 리더보드(현재 보유 인스턴스 기준·하락 반응형)와는 다른 축.
 */
export type MaxReached = { maxEnhance: number; maxTranscend: number };

export const getMaxReached = cache(async (userId: string): Promise<MaxReached> => {
  const [row] = await db
    .select({
      maxEnhance: sql<number>`coalesce(max(${userCodex.maxEnhanceLevel}), 0)`,
      maxTranscend: sql<number>`coalesce(max(${userCodex.maxTranscendLevel}), 0)`,
    })
    .from(userCodex)
    .where(eq(userCodex.userId, userId));
  return { maxEnhance: row?.maxEnhance ?? 0, maxTranscend: row?.maxTranscend ?? 0 };
});
