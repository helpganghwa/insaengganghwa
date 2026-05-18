/**
 * SCHEMA §4. 초월 (즉시·무RNG)
 *
 * 초월 레벨은 equipment_instances.transcend_level 직접 증가(0..10 CHECK).
 * 제물 개체는 영구 삭제 + 본 로그 기록 = 단일 트랜잭션(CLAUDE §3.3).
 * 제물 조건: 같은 catalog_item_id + 미장착·비강화중 (강화/초월 레벨 무관, +0 가능).
 */
import { pgTable, uuid, integer, smallint, bigint, bigserial, timestamp } from 'drizzle-orm/pg-core';

/** §4.1 transcend_logs — append-only 감사. */
export const transcendLogs = pgTable('transcend_logs', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  userId: uuid('user_id').notNull(),
  equipmentInstanceId: bigint('equipment_instance_id', { mode: 'bigint' }).notNull(),
  catalogItemId: integer('catalog_item_id').notNull(),
  fromT: smallint('from_t').notNull(),
  toT: smallint('to_t').notNull(),
  /** 해당 단계 제물 수 (BALANCE §2.1 선형 1→10). */
  fodderCount: integer('fodder_count').notNull(),
  /** 소모(삭제)된 개체 id 기록 — 삭제돼도 감사 보존(FK 없음). */
  fodderInstanceIds: bigint('fodder_instance_ids', { mode: 'bigint' }).array().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type TranscendLog = typeof transcendLogs.$inferSelect;
