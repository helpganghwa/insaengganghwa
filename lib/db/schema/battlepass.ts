/**
 * SCHEMA §14. 배틀패스 (성장 패스 — 만료 없음, BALANCE §9)
 *
 * 진행도는 계정 '최고 도달'(user_equipment MAX, lib/game/codex/max-reached)에서 파생 —
 * 별도 저장 안 함. 저장하는 건 **수령 high-water mark**뿐:
 *  - 무료 라인: pass별 free_claimed_through(수령 완료한 최고 단계).
 *  - 프리미엄 라인: 산 구간별 premium_claimed_through. 구간 row 존재 = 구매됨.
 * 보상 단조(최고 도달 기준)라 high-water 1개로 충분(구간 내 단계당 동일).
 */
import {
  pgTable,
  pgEnum,
  uuid,
  integer,
  timestamp,
  primaryKey,
} from 'drizzle-orm/pg-core';

import { profiles } from './profiles';

export const battlePassTypeEnum = pgEnum('battlepass_type', ['enhance', 'transcend']);

/** §14.1 battlepass_state — pass별 무료 라인 수령 진척(PK user+type). */
export const battlePassState = pgTable(
  'battlepass_state',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    passType: battlePassTypeEnum('pass_type').notNull(),
    /** 무료 보상 수령 완료한 최고 단계(level). 0 = 미수령. */
    freeClaimedThrough: integer('free_claimed_through').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.passType] })],
);

/** §14.2 battlepass_segments — 구매한 프리미엄 구간(존재 = 구매). PK user+type+segment. */
export const battlePassSegments = pgTable(
  'battlepass_segments',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    passType: battlePassTypeEnum('pass_type').notNull(),
    /** 구간 인덱스(0부터). 강화 c=+1~100·+101~200…, 초월 c=T1~10·T11~20… */
    segmentIndex: integer('segment_index').notNull(),
    /** 그 구간 프리미엄 수령 완료한 최고 단계(level). 구매 시 c×size로 초기화 후 소급 수령. */
    premiumClaimedThrough: integer('premium_claimed_through').notNull().default(0),
    purchasedAt: timestamp('purchased_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.passType, t.segmentIndex] })],
);

export type BattlePassState = typeof battlePassState.$inferSelect;
export type BattlePassSegment = typeof battlePassSegments.$inferSelect;
