import 'server-only';

import { eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { profiles } from '@/lib/db/schema/profiles';
import { sendPushToUser } from '@/lib/push/send';

/**
 * 강화 알림 분기 — 사용자 push_enhance_mode 에 따라 즉시 발송 또는 그룹화 누적.
 *
 * - 'instant' (기본): sendPushToUser 즉시 호출
 * - 'batched': push_pending 적재 → push-flush cron이 30분 윈도 후 묶음 발송
 *
 * resolveEnhance(lazy + cron 둘 다)에서 호출. 게임 트랜잭션 외부, best-effort.
 */
export type EnhanceItem = {
  fromLevel: number;
  toLevel: number;
  outcome: 'success' | 'hold' | 'down';
};

function describeOne(item: EnhanceItem, itemKo?: string): { title: string; body: string } {
  const arrow = item.outcome === 'success' ? '→' : item.outcome === 'down' ? '↓' : '·';
  const head = item.outcome === 'success' ? '강화 성공' : item.outcome === 'down' ? '강화 하락' : '강화 완료';
  const itemLabel = itemKo ? `${itemKo} ` : '';
  return {
    title: head,
    body: `${itemLabel}+${item.fromLevel} ${arrow} +${item.toLevel}`,
  };
}

export async function appendEnhancePending(
  userId: string,
  item: EnhanceItem,
  itemKo?: string,
): Promise<void> {
  // mode 조회 — 매 resolve당 1회. 부담 작음(profile 단일 row, index PK).
  const [p] = await db
    .select({ mode: profiles.pushEnhanceMode })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);
  const mode = p?.mode ?? 'instant';

  if (mode === 'instant') {
    const { title, body } = describeOne(item, itemKo);
    await sendPushToUser(userId, {
      title,
      body,
      url: '/enhance',
      // tag 'enhance' = 같은 카테고리 알림 OS 묶음(머지) — 폭격 완화.
      tag: 'enhance',
      category: 'enhance',
    });
    return;
  }

  // batched — push_pending 누적, push-flush cron이 30분 후 발송.
  const itemJson = JSON.stringify(item);
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
