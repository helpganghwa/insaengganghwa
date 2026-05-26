import 'server-only';

import { eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { profiles } from '@/lib/db/schema/profiles';
import { sendPushToUser } from '@/lib/push/send';

/**
 * 강화 '준비 완료'(=complete_at 도달, 최대확률) 알림 적재/발송.
 *
 * 트리거: /api/cron/push-enhance-ready (매 5분) — push_sent=false 잡 발견 시 호출.
 * 모드 분기:
 *  - instant (기본): sendPushToUser 즉시 호출 — 슬롯별 즉시 알림(OS tag 묶음)
 *  - batched: push_pending 적재 → push-flush cron이 30분 윈도 후 묶음 발송
 *
 * 게임 트랜잭션 외부, best-effort. 발송 후 cron이 enhancement_jobs.push_sent=true 마크.
 */
export type EnhanceReadyItem = {
  jobId: string;
  fromLevel: number;
  targetLevel: number;
  itemKo: string;
};

function describeOne(item: EnhanceReadyItem): { title: string; body: string } {
  return {
    title: '강화 준비 완료',
    body: `${item.itemKo} +${item.fromLevel} → +${item.targetLevel} 최대 확률 도달`,
  };
}

export async function appendEnhanceReady(
  userId: string,
  item: EnhanceReadyItem,
): Promise<void> {
  const [p] = await db
    .select({ mode: profiles.pushEnhanceMode })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);
  const mode = p?.mode ?? 'instant';

  if (mode === 'instant') {
    const { title, body } = describeOne(item);
    await sendPushToUser(userId, {
      title,
      body,
      url: '/enhance',
      tag: 'enhance',
      category: 'enhance',
    });
    return;
  }

  // batched — push_pending 누적, push-flush cron이 30분 후 묶어 발송.
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
