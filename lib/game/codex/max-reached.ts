import 'server-only';

import { cache } from 'react';
import { eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { userEquipment } from '@/lib/db/schema/equipment';

/**
 * 계정 '최고 도달' — 단일 최고 아이템의 lifetime 레벨(배틀패스 진행 입력).
 *
 * user_equipment에 카탈로그별 역대 최고가 단조 유지되므로(강화 하락과 무관), 계정 최고 =
 * MAX 집계. (user_id) 인덱스 위 작은 테이블 집계라 비용 무시 가능.
 */
export type MaxReached = { maxEnhance: number; maxTranscend: number };

export const getMaxReached = cache(async (userId: string): Promise<MaxReached> => {
  const [row] = await db
    .select({
      maxEnhance: sql<number>`coalesce(max(${userEquipment.maxEnhanceLevel}), 0)`,
      maxTranscend: sql<number>`coalesce(max(${userEquipment.maxTranscendLevel}), 0)`,
    })
    .from(userEquipment)
    .where(eq(userEquipment.userId, userId));
  return { maxEnhance: row?.maxEnhance ?? 0, maxTranscend: row?.maxTranscend ?? 0 };
});
