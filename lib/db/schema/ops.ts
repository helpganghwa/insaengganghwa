/**
 * SCHEMA §10. 운영 / 감사 / 안티치트
 *
 * 확률공시 스냅샷(게임산업법 §33, 변경 시 영구 기록+24h 사전), 점검 모드,
 * 광고 보상 검증(1회용 토큰·중복 거부), 운영 감사 로그. 레이트리밋은 Upstash(DB 아님).
 */
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  bigserial,
  boolean,
  jsonb,
  timestamp,
} from 'drizzle-orm/pg-core';

export const systemModeValueEnum = pgEnum('system_mode_value', [
  'live',
  'read_only',
  'maintenance',
  'emergency_stop',
]);
export const adRewardEnum = pgEnum('ad_reward', ['supply_box', 'mail_instant']);

/** §10.1 probability_snapshots — 확률/수치 공시 전문 영구 기록. */
export const probabilitySnapshots = pgTable('probability_snapshots', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  effectiveAt: timestamp('effective_at', { withTimezone: true }).notNull(),
  /** baseRate 표·보급 균등 규칙·환산률 등 공시 전문. */
  payload: jsonb('payload').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** §10.2 system_mode — 단일 행(key='global'). 모든 게임 API 진입 미들웨어가 참조. */
export const systemMode = pgTable('system_mode', {
  key: text('key').primaryKey().default('global'),
  mode: systemModeValueEnum('mode').notNull().default('live'),
  note: text('note'),
  updatedBy: uuid('updated_by'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** §10.3 ad_views — 광고 보상 검증(1회용·5분 만료·중복 거부). */
export const adViews = pgTable('ad_views', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  userId: uuid('user_id').notNull(),
  adToken: text('ad_token').notNull().unique(),
  reward: adRewardEnum('reward').notNull(),
  granted: boolean('granted').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

/** §10.4 admin_actions — 운영 감사 로그. */
export const adminActions = pgTable('admin_actions', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  adminUserId: uuid('admin_user_id').notNull(),
  action: text('action').notNull(),
  targetType: text('target_type'),
  targetId: text('target_id'),
  payload: jsonb('payload'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
