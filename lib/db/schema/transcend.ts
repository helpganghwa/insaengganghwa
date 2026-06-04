/**
 * SCHEMA §4. 초월 (자동·무RNG)
 *
 * 박스 열기로 같은 카탈로그 중복이 누적(user_equipment.transcend_progress)되어 임계 도달 시
 * 자동으로 transcend_level +1. 본 로그는 그 발생을 append-only 기록(단일 트랜잭션, CLAUDE §3.3).
 */
import { pgTable, uuid, integer, bigint, bigserial, timestamp } from 'drizzle-orm/pg-core';

/** §4.1 transcend_logs — append-only 감사. 자동 초월 1단계당 1행. */
export const transcendLogs = pgTable('transcend_logs', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  userId: uuid('user_id').notNull(),
  userEquipmentId: bigint('user_equipment_id', { mode: 'bigint' }).notNull(),
  catalogItemId: integer('catalog_item_id').notNull(),
  fromT: integer('from_t').notNull(),
  toT: integer('to_t').notNull(),
  /** 해당 단계 소모 중복 수 (BALANCE §2.1 선형 = toT). */
  fodderCount: integer('fodder_count').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type TranscendLog = typeof transcendLogs.$inferSelect;
