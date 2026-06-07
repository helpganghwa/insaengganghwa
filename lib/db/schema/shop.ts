/**
 * SCHEMA §13. 상점 무료 수령 — 슬롯별(일일/주간/월간/가입) 주기 멱등 가드.
 * period_key = 현재 주기 식별자(KST): 일일 'YYYY-MM-DD' · 주간 'Wmonday' · 월간 'YYYY-MM' · 가입 'once'.
 * row.period_key === 현재 주기 → 이미 수령. PK(user_id, slot)로 동시 중복 차단.
 */
import { pgTable, uuid, text, timestamp, primaryKey } from 'drizzle-orm/pg-core';

import { profiles } from './profiles';

export const shopFreeClaims = pgTable(
  'shop_free_claims',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    slot: text('slot').notNull(),
    periodKey: text('period_key').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.slot] })],
);

export type ShopFreeClaim = typeof shopFreeClaims.$inferSelect;
