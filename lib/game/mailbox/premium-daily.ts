import 'server-only';

import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { PREMIUM } from '@/lib/game/shop/catalog';

/**
 * 성장 프리미엄 일일 보상 — 활성 프리미엄 보유자에게 KST 자정 기준 1회 자동 우편 발송.
 * lazy(layout에서 호출, cron 의존 X). 일반 일일 보급(ensureDailyMail)과 별개 채널.
 *
 * 멱등: premium_daily_grants(user_id, server_id, kst_day) PK + 단일 multi-CTE SQL.
 * 활성 조건: shop_purchases에 premium 구매 기록이 있고, 오늘(KST) ≤ 구매일(KST)+29
 *   (구매일=1일차 … 30일차까지 30회. getPremiumRemainingDays의 remaining>0 창과 일치).
 *
 * 보상: 다이아 300 + 슬롯별 상자 5개(무기·방어구·장신구 균등) = 총 15개. 테스트 배율 미적용
 *   (성장 프리미엄은 유료 상품 고정 수치).
 */
const PER_SLOT = PREMIUM.daily.boxes / 3; // 15 → 5/5/5
const PAYLOAD = JSON.stringify({
  diamond: PREMIUM.daily.diamond,
  boxes: { weapon: PER_SLOT, armor: PER_SLOT, accessory: PER_SLOT },
});
const WINDOW_DAYS = PREMIUM.daily.days - 1; // 구매일 포함 30일 → +29까지 활성

export async function ensurePremiumDailyMail(userId: string, serverId: number): Promise<boolean> {
  const r = (await db.execute(sql`
    with active as (
      select 1 from shop_purchases sp
      where sp.user_id = ${userId}::uuid
        and sp.server_id = ${serverId}
        and sp.product_id = ${PREMIUM.id}
        and (now() at time zone 'Asia/Seoul')::date
            <= (sp.updated_at at time zone 'Asia/Seoul')::date + (${WINDOW_DAYS})::int
    ),
    g as (
      insert into premium_daily_grants (user_id, server_id, kst_day)
      select ${userId}::uuid, ${serverId}, (now() at time zone 'Asia/Seoul')::date
      where exists (select 1 from active)
      on conflict do nothing
      returning kst_day
    )
    insert into mailbox (user_id, server_id, type, title, body, sender_label, payload, expires_at)
    select ${userId}::uuid,
           ${serverId},
           'reward'::mailbox_type,
           '성장 프리미엄 — 오늘의 보상',
           '성장 프리미엄 일일 보상이 도착했습니다. 7일 안에 받으세요.',
           '성장 프리미엄',
           ${PAYLOAD}::jsonb,
           now() + interval '7 days'
    from g
    returning id::text id
  `)) as unknown as { id: string }[];
  return r.length > 0;
}
