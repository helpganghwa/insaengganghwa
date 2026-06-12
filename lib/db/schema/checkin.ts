/**
 * SCHEMA §12. 출석 캘린더 (28일 누적·반복)
 *
 * GDD §7 · BALANCE §7. 1일 1회(KST 자정) 수령 — 누적 출석, 끊겨도 자리 유지.
 * 멱등: state.last_claimed_kst_day = KST today 차단 + checkin_claim_logs UNIQUE(user_id, kst_day).
 */
import {
  pgTable,
  primaryKey,
  uuid,
  bigint,
  bigserial,
  smallint,
  date,
  jsonb,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { profiles } from './profiles';

/** §12.1 user_checkin_state — 1행/유저. UPSERT로 첫 수령 시 생성. */
export const userCheckinState = pgTable(
  'user_checkin_state',
  {
  userId: uuid('user_id')
    .notNull()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  /** 소속 서버(SERVER.md P3b). */
  serverId: smallint('server_id').notNull().default(1),
  /** 마지막 수령 칸의 0-index(0~27). 다음 받을 칸 1-index = (dp % 28) + 1. */
  dayProgress: smallint('day_progress').notNull().default(0),
  /** KST 일자. 같은 KST day 재수령 차단. null = 한 번도 수령 안 함. */
  lastClaimedKstDay: date('last_claimed_kst_day', { mode: 'string' }),
  totalClaimedCount: bigint('total_claimed_count', { mode: 'bigint' })
    .notNull()
    .default(sql`0`),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.serverId] })],
);

export type UserCheckinState = typeof userCheckinState.$inferSelect;

/** §12.2 checkin_claim_logs — append-only 감사 + (user_id, kst_day) UNIQUE 보조 가드. */
export const checkinClaimLogs = pgTable(
  'checkin_claim_logs',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    /** 소속 서버(SERVER.md P3b). */
    serverId: smallint('server_id').notNull().default(1),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    kstDay: date('kst_day', { mode: 'string' }).notNull(),
    /** 1~28 — 이 수령이 매핑된 캘린더 칸. */
    cycleDay: smallint('cycle_day').notNull(),
    diamondGranted: bigint('diamond_granted', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    /** {weapon?, armor?, accessory?} */
    boxesGranted: jsonb('boxes_granted').notNull().default(sql`'{}'::jsonb`),
    claimedAt: timestamp('claimed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('checkin_logs_user_day_uniq').on(t.userId, t.serverId, t.kstDay)],
);

export type CheckinClaimLog = typeof checkinClaimLogs.$inferSelect;
