import 'server-only';

import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { TEST_REWARD_MULTIPLIER } from '@/lib/game/test-mode';

/**
 * 일일 보급 — KST 자정 기준 1회 자동 발송. lazy(layout에서 호출).
 *
 * 멱등: daily_supply_grants(user_id, kst_day) PK + multi-CTE 단일 SQL.
 * 동시 N 요청 시 첫 INSERT만 성공(ON CONFLICT DO NOTHING), 나머지 메일
 * INSERT 0행(WHERE g 비어있음). 다음 KST day에 다시 활성.
 *
 * 보상(기본): 1000 다이아 + 슬롯별 보급권 5장(weapon/armor/accessory).
 * 테스트 기간에는 ×TEST_REWARD_MULTIPLIER로 지급.
 */
const BASE_DIAMOND = 1000;
const BASE_BOX_PER_SLOT = 5;
const PAYLOAD = JSON.stringify({
  diamond: BASE_DIAMOND * TEST_REWARD_MULTIPLIER,
  boxes: {
    weapon: BASE_BOX_PER_SLOT * TEST_REWARD_MULTIPLIER,
    armor: BASE_BOX_PER_SLOT * TEST_REWARD_MULTIPLIER,
    accessory: BASE_BOX_PER_SLOT * TEST_REWARD_MULTIPLIER,
  },
});

export async function ensureDailyMail(userId: string): Promise<boolean> {
  // KST today를 SQL에서 계산해 race 없음. 성공 시 1행 RETURNING.
  const r = (await db.execute(sql`
    with g as (
      insert into daily_supply_grants (user_id, kst_day)
      values (${userId}::uuid, (now() at time zone 'Asia/Seoul')::date)
      on conflict do nothing
      returning kst_day
    )
    insert into mailbox (user_id, type, title, body, sender_label, payload, expires_at)
    select ${userId}::uuid,
           'reward'::mailbox_type,
           '오늘의 보급',
           '동트는 종소리와 함께 보급이 닿았습니다. 7일 안에 받으세요.',
           '일일 보급',
           ${PAYLOAD}::jsonb,
           now() + interval '7 days'
    from g
    returning id::text id
  `)) as unknown as { id: string }[];
  return r.length > 0;
}
