/**
 * SCHEMA §8. 공유 / 추천 (referral)
 *
 * 자랑 2종(장비 단위/장비 전체). 트리거 enh30/enh50/enh99/first_transcend/transcend_max.
 * 가입 전환 시 공유자 +300 다이아(멱등). 클릭/펀널 상세는 PostHog.
 */
import {
  pgTable,
  smallint,
  pgEnum,
  uuid,
  text,
  bigserial,
  boolean,
  jsonb,
  timestamp,
} from 'drizzle-orm/pg-core';

import { profiles } from './profiles';

export const shareUnitEnum = pgEnum('share_unit', ['single', 'full']);
export const shareTriggerEnum = pgEnum('share_trigger', [
  'enh30',
  'enh50',
  'enh99',
  'first_transcend',
  'transcend_max',
  'manual',
]);

/** §8.1 shares. */
export const shares = pgTable('shares', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  /** 생성 시점 서버 박제(SERVER.md P6) — 스냅샷과 동일 원칙. */
  serverId: smallint('server_id').notNull().default(1),
  unit: shareUnitEnum('unit').notNull(),
  trigger: shareTriggerEnum('trigger').notNull(),
  shareCode: text('share_code').notNull().unique(),
  /** OG 렌더 스냅샷(닉/강화/초월/전투력/3슬롯). */
  snapshot: jsonb('snapshot').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** §8.2 referral_attributions — 가입 전환(1회 귀속·멱등). */
export const referralAttributions = pgTable('referral_attributions', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  referrerUserId: uuid('referrer_user_id')
    .notNull()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  newUserId: uuid('new_user_id')
    .notNull()
    .unique()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  shareCode: text('share_code').notNull(),
  /** 멱등 — 공유자 +300 다이아(BALANCE §6.3) 1회. */
  rewarded: boolean('rewarded').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
