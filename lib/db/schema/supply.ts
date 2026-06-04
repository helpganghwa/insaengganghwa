/**
 * SCHEMA §5. 보급 (보급 상자)
 *
 * 슬롯별 미열기 집계. 열기 = count−1 + 카탈로그 획득/초월진행도 누적 + 로그, 단일 트랜잭션.
 * 슬롯 내 균등 1/(활성 종수), 천장 없음.
 */
import {
  pgTable,
  uuid,
  bigint,
  bigserial,
  integer,
  boolean,
  timestamp,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { profiles } from './profiles';
import { slotEnum, catalogItems } from './equipment';

/** §5.1 user_supply_boxes — 미열기 인벤토리(슬롯별 집계). */
export const userSupplyBoxes = pgTable(
  'user_supply_boxes',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    slot: slotEnum('slot').notNull(),
    count: bigint('count', { mode: 'bigint' }).notNull().default(sql`0`),
  },
  (t) => [primaryKey({ columns: [t.userId, t.slot] })],
);

/** §5.2 supply_open_logs — append-only 감사·공시 정합. */
export const supplyOpenLogs = pgTable('supply_open_logs', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  userId: uuid('user_id').notNull(),
  slot: slotEnum('slot').notNull(),
  catalogItemId: integer('catalog_item_id')
    .notNull()
    .references(() => catalogItems.id),
  /** 도감 신규 해금 여부. */
  isNew: boolean('is_new').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type UserSupplyBoxes = typeof userSupplyBoxes.$inferSelect;
