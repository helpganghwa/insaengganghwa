import 'server-only';

import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';

/**
 * push_pending 누적 — 강화 완료 그룹화 v1(BALANCE §11.2).
 *
 * resolveEnhance 직후 호출되어 (user_id, 'enhance') 행에 결과 1건을 jsonb append.
 * first_at은 새 행 INSERT 시점에만 stamping(ON CONFLICT 시 변경 X) — 30분 윈도 기준 시점.
 *
 * cron(/api/cron/push-flush)이 매 5분 호출되어 first_at + 30min 도달한 행을 묶어 발송.
 */
export type EnhanceItem = {
  fromLevel: number;
  toLevel: number;
  outcome: 'success' | 'hold' | 'down';
};

export async function appendEnhancePending(
  userId: string,
  item: EnhanceItem,
): Promise<void> {
  const itemJson = JSON.stringify(item);
  // 파라미터 바인딩으로 jsonb 주입(injection 안전). jsonb_build_array(::jsonb)로 단일 항목 배열 생성.
  await db.execute(sql`
    insert into push_pending (user_id, category, items, first_at)
    values (
      ${userId}::uuid,
      'enhance'::push_category,
      jsonb_build_array(${itemJson}::jsonb),
      now()
    )
    on conflict (user_id, category) do update
      set items = push_pending.items || ${itemJson}::jsonb,
          updated_at = now()
  `);
}
