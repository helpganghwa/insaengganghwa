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
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { profiles } from './profiles';

// 'expired' = 24h+ 이탈 pending 종결(payment-recon, 0108) — 늦은 결제는 expired→paid 재전이 허용.
export const iapStatusEnum = pgEnum('iap_status', ['pending', 'paid', 'refunded', 'expired']);
export const iapRefundReasonEnum = pgEnum('iap_refund_reason', [
  'user',
  'minor_protection',
  'error',
]);
export const identityProviderEnum = pgEnum('identity_provider', ['kmc', 'pass', 'kg_inicis']);

/** §9.1 iap_orders. */
export const iapOrders = pgTable(
  'iap_orders',
  {
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
    /** 지급 없이 paid 된 주문(특가 중복·미성년 보류, 0108) — 환불 시 재화 회수 스킵 근거. */
    grantSkipped: boolean('grant_skipped').notNull().default(false),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // payment-recon 10분 주기 스캔(부분) + 유저 구매내역 — 0107 수동 적용.
    index('iap_orders_pending_created_idx').on(t.createdAt).where(sql`${t.status} = 'pending'`),
    index('iap_orders_paid_paidat_idx').on(t.paidAt).where(sql`${t.status} = 'paid'`),
    index('iap_orders_user_idx').on(t.userId),
  ],
);

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

/**
 * §9.5 payment_alerts — 결제 사고 감지/알림(PAYMENT-SAFETY.md).
 *
 * 인라인(웹훅)·정합성 cron이 위험 이벤트를 영속 기록. 같은 (kind, payment_id) 미해결 건은
 * 1회만 생성·발송(중복 알림 방지) — 운영자가 resolved 처리 후 재발하면 새 row.
 */
export const paymentAlerts = pgTable(
  'payment_alerts',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    /** 사고 유형 — PAID_NOT_GRANTED / REFUND_RECLAIM_FAILED / AMOUNT_MISMATCH / WEBHOOK_VERIFY_FAILED / MINOR_LIMIT_EXCEEDED / ORPHAN_PENDING / COMPLETE_EXCEPTION / PARTIAL_CANCELLED. */
    kind: text('kind').notNull(),
    /** critical / high / warn. */
    severity: text('severity').notNull(),
    /** 관련 주문(있으면). PortOne 결제 id = portone_order_id. 미파싱 이벤트는 ''. */
    paymentId: text('payment_id').notNull().default(''),
    orderId: bigint('order_id', { mode: 'bigint' }),
    detail: text('detail').notNull(),
    resolved: boolean('resolved').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (t) => [
    // 미해결 동일 (kind, payment_id) 중복 차단 — 알림 1회. resolved 후엔 재생성 허용(부분 유니크).
    uniqueIndex('payment_alerts_open_uq')
      .on(t.kind, t.paymentId)
      .where(sql`${t.resolved} = false`),
    // 어드민 패널 — 미해결 최신순.
    index('payment_alerts_open_idx').on(t.resolved, t.createdAt),
  ],
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
