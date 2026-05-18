/**
 * SCHEMA §7. 우편함 (인게임 인박스)
 *
 * 오프라인 완료 강화 결과 · 레이드 6h 정산 · 비동기 보상 · 운영 공지 적재
 * (lazy + cron 멱등, CLAUDE §3.4). "광고 → 우편 즉시 수령"으로 가속(GDD §3.7).
 * 진입점 UI는 추후 확정(WIREFRAMES §0).
 */
import {
  pgTable,
  pgEnum,
  uuid,
  bigserial,
  jsonb,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';

import { profiles } from './profiles';

export const mailboxTypeEnum = pgEnum('mailbox_type', [
  'enhance_result',
  'raid_settlement',
  'reward',
  'notice',
]);

export const mailbox = pgTable(
  'mailbox',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    type: mailboxTypeEnum('type').notNull(),
    /** 다이아/보급상자(slot)/아이템/문구 등 — 타입별 payload. */
    payload: jsonb('payload').notNull(),
    /** 수령 시각(null = 미수령). */
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('mailbox_user_claimed_idx').on(t.userId, t.claimedAt)],
);

export type Mail = typeof mailbox.$inferSelect;
