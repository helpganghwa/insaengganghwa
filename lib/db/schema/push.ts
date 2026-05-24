/**
 * SCHEMA §11. PWA Web Push (CLAUDE §3 · GDD §3.10 v1)
 *
 * 트랜잭션 푸시 v1 — 강화완료(30분 그룹화)·레이드 종료·일일 보급 충전. 마케팅 푸시는
 * v1 미도입(별도 옵트인 필요 — 야간 규제). 카테고리별 토글은 profiles에 직접 컬럼.
 */
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  jsonb,
  bigserial,
  timestamp,
  primaryKey,
  index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { profiles } from './profiles';

export const pushCategoryEnum = pgEnum('push_category', ['enhance', 'raid', 'supply']);

/**
 * §11.1 push_subscriptions — 디바이스별 Web Push 구독. endpoint UNIQUE로 재구독 멱등.
 * 발송 시 410 Gone 응답 → row 자동 삭제(invalid endpoint cleanup).
 */
export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    /** PushSubscription.endpoint — 푸시 서비스 라우팅 URL(FCM/APNS). */
    endpoint: text('endpoint').notNull().unique(),
    /** PushSubscription.keys.p256dh (ECDH public key, base64url). */
    p256dh: text('p256dh').notNull(),
    /** PushSubscription.keys.auth (16-byte auth secret, base64url). */
    auth: text('auth').notNull(),
    /** 진단용. 디바이스 식별/디버깅. */
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('push_sub_user_idx').on(t.userId)],
);

/**
 * §11.2 push_pending — 카테고리별 누적 알림 큐. (user_id, category) PK = 사용자당 1행.
 *
 * 강화 완료 그룹화 시나리오:
 *  1) resolveEnhance 직후: INSERT … ON CONFLICT (user_id, category) DO UPDATE
 *     SET items = items || new_item (jsonb append). first_at은 INSERT 시점 고정.
 *  2) /api/cron/push-flush(매 5분): first_at + 30min 도달한 row 묶음 발송 후 DELETE.
 *
 * 즉시 발송 카테고리(raid/supply)는 push_pending을 거치지 않고 직접 send 호출.
 */
export const pushPending = pgTable(
  'push_pending',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    category: pushCategoryEnum('category').notNull(),
    /** 누적 항목 배열 (강화: [{ fromLevel, toLevel, outcome }]). */
    items: jsonb('items').notNull().default(sql`'[]'::jsonb`),
    /** 첫 누적 시각 — flush 트리거(`first_at + interval '30 min' <= now()`). */
    firstAt: timestamp('first_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.category] }),
    index('push_pending_flush_idx').on(t.firstAt),
  ],
);

export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type PushPending = typeof pushPending.$inferSelect;
