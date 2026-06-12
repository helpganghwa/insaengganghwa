/**
 * SCHEMA §9. 결제 / IAP / 본인인증 (REGULATORY)
 *
 * 포트원 webhook 멱등 = portone_order_id UNIQUE(CLAUDE §3.4). 미성년 월 7만원 한도,
 * 분기 5만원 환불 보호, 환불 시 재화 자동 회수. 본인인증 결과 요약은 profiles(§1).
 */
import {
  smallint,
  pgTable,
  pgEnum,
  uuid,
  text,
  bigint,
  bigserial,
  boolean,
  timestamp,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { profiles } from './profiles';

export const iapStatusEnum = pgEnum('iap_status', ['pending', 'paid', 'refunded']);
export const iapRefundReasonEnum = pgEnum('iap_refund_reason', [
  'user',
  'minor_protection',
  'error',
]);
export const identityProviderEnum = pgEnum('identity_provider', ['kmc', 'pass']);

/** §9.1 iap_orders. */
export const iapOrders = pgTable('iap_orders', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  /** 지급 대상 지갑 서버(SERVER.md §4) — 미성년 월 한도는 계정 합산(서버 무관). */
  serverId: smallint('server_id').notNull().default(1),
  userId: uuid('user_id')
    .notNull()
    .references(() => profiles.id),
  /** webhook 멱등 키. */
  portoneOrderId: text('portone_order_id').notNull().unique(),
  productCode: text('product_code').notNull(),
  amountKrw: bigint('amount_krw', { mode: 'bigint' }).notNull(),
  diamondGranted: bigint('diamond_granted', { mode: 'bigint' }).notNull(),
  status: iapStatusEnum('status').notNull().default('pending'),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** §9.2 iap_refunds — 환불 시 재화 자동 회수(GDD §8). */
export const iapRefunds = pgTable('iap_refunds', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  orderId: bigint('order_id', { mode: 'bigint' })
    .notNull()
    .references(() => iapOrders.id),
  userId: uuid('user_id').notNull(),
  reason: iapRefundReasonEnum('reason').notNull(),
  amountKrw: bigint('amount_krw', { mode: 'bigint' }).notNull(),
  clawbackDone: boolean('clawback_done').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** §9.3 monthly_purchase_limits — 미성년 월 7만원(YYYYMM, KST). */
export const monthlyPurchaseLimits = pgTable(
  'monthly_purchase_limits',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    kstMonth: text('kst_month').notNull(), // 'YYYYMM'
    totalKrw: bigint('total_krw', { mode: 'bigint' }).notNull().default(sql`0`),
  },
  (t) => [primaryKey({ columns: [t.userId, t.kstMonth] })],
);

/** §9.4 identity_verifications — append-only 감사. */
export const identityVerifications = pgTable('identity_verifications', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  provider: identityProviderEnum('provider').notNull(),
  birthYearHash: text('birth_year_hash').notNull(),
  isAdult: boolean('is_adult').notNull(),
  verifiedAt: timestamp('verified_at', { withTimezone: true }).notNull().defaultNow(),
});
