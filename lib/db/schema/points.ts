import { bigint, bigserial, index, pgTable, smallint, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { profiles } from './profiles';

/**
 * 포인트 원장(0197, docs/POINT-SHOP.md) — 대난투 포인트·마일리지 공용. 잔액은 characters.melee_points(서버별)·
 * profiles.mileage(계정)에 캐시하고, 이 원장이 정본. (kind, ref) 부분 유니크가 멱등 키.
 */
export const pointLedger = pgTable(
  'point_ledger',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    /** 대난투 행은 서버, 마일리지 행은 null(계정 단위). */
    serverId: smallint('server_id'),
    kind: text('kind').$type<'melee' | 'mileage'>().notNull(),
    delta: bigint('delta', { mode: 'bigint' }).notNull(),
    /** 화면 표기용 한 줄(예: '대난투 4위', '다이아 충전 ₩28,000', '환불 회수'). */
    note: text('note').notNull().default(''),
    /** 멱등 키 — 'melee:<battle>:<user>' | 'order:<id>' | 'order:<id>:refund'. */
    ref: text('ref'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('point_ledger_user_kind_idx').on(t.userId, t.kind, t.createdAt)],
);
