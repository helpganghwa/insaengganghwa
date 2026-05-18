/**
 * SCHEMA §3. 강화 큐 & 감사 로그 (CLAUDE §6 — 서버 권위·멱등)
 *
 * 시간 = 서버 시계만 신뢰. 완료 판정 = now() >= complete_at. baseRate·환산률·duration은
 * 등록 시점 스냅샷 영구(소급 금지). 로그는 append-only 5년 보관.
 */
import {
  pgTable,
  pgEnum,
  uuid,
  integer,
  smallint,
  bigint,
  bigserial,
  text,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { profiles } from './profiles';
import { slotEnum, equipmentInstances } from './equipment';

export const enhanceJobStatusEnum = pgEnum('enhance_job_status', [
  'running',
  'completed',
  'cancelled',
]);
/** 성공 +1 / 유지(안전 실패) / 하락(−1, +52~). 파괴 없음. */
export const enhanceResultEnum = pgEnum('enhance_result', ['success', 'hold', 'down']);

/** §3.1 enhancement_jobs — 진행 중 큐. */
export const enhancementJobs = pgTable(
  'enhancement_jobs',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    equipmentInstanceId: bigint('equipment_instance_id', { mode: 'bigint' })
      .notNull()
      .references(() => equipmentInstances.id, { onDelete: 'cascade' }),
    slot: slotEnum('slot').notNull(),
    /** 부위당 2 lane (1|2, GDD §3.2). */
    slotLane: smallint('slot_lane').notNull(),
    fromLevel: integer('from_level').notNull(),
    targetLevel: integer('target_level').notNull(),
    /** 등록 시점 baseRate 스냅샷(bp, 공시·감사). */
    baseRateBp: integer('base_rate_bp').notNull(),
    /** 등록 시점 산정 d(target) (BALANCE §1.1). */
    durationMs: bigint('duration_ms', { mode: 'bigint' }).notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    /** 단축 시 갱신. 완료 판정 = now() >= complete_at. */
    completeAt: timestamp('complete_at', { withTimezone: true }).notNull(),
    totalReducedMs: bigint('total_reduced_ms', { mode: 'bigint' }).notNull().default(sql`0`),
    /** target ≥ +100 시 소모 제물 개체 (BALANCE §1.1). 개체 삭제 시 null. */
    fodderInstanceId: bigint('fodder_instance_id', { mode: 'bigint' }).references(
      () => equipmentInstances.id,
      { onDelete: 'set null' },
    ),
    status: enhanceJobStatusEnum('status').notNull().default('running'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // lane 점유 (SLOT_BUSY) — 슬롯·lane에 running 1건.
    uniqueIndex('ej_user_slot_lane_running_uq')
      .on(t.userId, t.slot, t.slotLane)
      .where(sql`${t.status} = 'running'`),
    // 같은 개체 중복 큐 차단.
    uniqueIndex('ej_instance_running_uq')
      .on(t.equipmentInstanceId)
      .where(sql`${t.status} = 'running'`),
    // lazy/cron 정산.
    index('ej_status_complete_idx').on(t.status, t.completeAt),
    index('ej_user_status_idx').on(t.userId, t.status),
  ],
);

/** §3.2 enhancement_logs — append-only 감사(5년). UPDATE/DELETE 금지. */
export const enhancementLogs = pgTable('enhancement_logs', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  userId: uuid('user_id').notNull(),
  equipmentInstanceId: bigint('equipment_instance_id', { mode: 'bigint' }).notNull(),
  catalogItemId: integer('catalog_item_id').notNull(),
  fromLevel: integer('from_level').notNull(),
  toLevel: integer('to_level').notNull(),
  result: enhanceResultEnum('result').notNull(),
  baseRateBp: integer('base_rate_bp').notNull(),
  effectiveRateBp: integer('effective_rate_bp').notNull(),
  elapsedMs: bigint('elapsed_ms', { mode: 'bigint' }).notNull(),
  durationMs: bigint('duration_ms', { mode: 'bigint' }).notNull(),
  reducedMs: bigint('reduced_ms', { mode: 'bigint' }).notNull().default(sql`0`),
  /** +100 제물 개체 id (삭제돼도 감사 보존 → FK 없음). */
  fodderInstanceId: bigint('fodder_instance_id', { mode: 'bigint' }),
  /** 사후 검증용(클라 변조 불가). */
  rngSeed: text('rng_seed'),
  rolled: integer('rolled'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** §3.3 gem_time_reductions — 보석 단축 이력(인플레이션·어뷰징 추적, GDD §8). */
export const gemTimeReductions = pgTable('gem_time_reductions', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  jobId: bigint('job_id', { mode: 'bigint' })
    .notNull()
    .references(() => enhancementJobs.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull(),
  gemsSpent: bigint('gems_spent', { mode: 'bigint' }).notNull(),
  reducedMs: bigint('reduced_ms', { mode: 'bigint' }).notNull(),
  /** 등록 시점 환산률 스냅샷 — 다이아당 ms (BALANCE §6.2, 1다이아=60000ms). */
  conversionMsPerDiamond: bigint('conversion_ms_per_diamond', { mode: 'bigint' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type EnhancementJob = typeof enhancementJobs.$inferSelect;
export type EnhancementLog = typeof enhancementLogs.$inferSelect;
