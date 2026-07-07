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
  boolean,
  text,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { profiles } from './profiles';
import { slotEnum, userEquipment } from './equipment';

export const enhanceJobStatusEnum = pgEnum('enhance_job_status', [
  'running',
  'completed',
  'cancelled',
]);
/** 성공 +1 / 메가 +2(success의 5%) / 유지(안전 실패) / 하락(−1, +52~). 파괴 없음. */
export const enhanceResultEnum = pgEnum('enhance_result', ['success', 'hold', 'down', 'mega']);

/** §3.1 enhancement_jobs — 진행 중 큐. */
export const enhancementJobs = pgTable(
  'enhancement_jobs',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    /** 소속 서버(SERVER.md P3b) — 캐릭터 단위 스코프. */
    serverId: smallint('server_id').notNull().default(1),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    userEquipmentId: bigint('user_equipment_id', { mode: 'bigint' })
      .notNull()
      .references(() => userEquipment.id, { onDelete: 'cascade' }),
    slot: slotEnum('slot').notNull(),
    /** 부위당 2 lane (1|2, GDD §3.2). */
    slotLane: smallint('slot_lane').notNull(),
    fromLevel: integer('from_level').notNull(),
    targetLevel: integer('target_level').notNull(),
    /** 등록 시점 baseRate 스냅샷(bp, 공시·감사). */
    baseRateBp: integer('base_rate_bp').notNull(),
    /** 등록 시점 downRate 스냅샷(bp, 소급 금지). null=스냅샷 이전 in-flight 잡(resolve가 코드상수 폴백). */
    downRateBp: integer('down_rate_bp'),
    /** 등록 시점 산정 d(target) (BALANCE §1.1). */
    durationMs: bigint('duration_ms', { mode: 'bigint' }).notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    /** 단축 시 갱신. 완료 판정 = now() >= complete_at. */
    completeAt: timestamp('complete_at', { withTimezone: true }).notNull(),
    totalReducedMs: bigint('total_reduced_ms', { mode: 'bigint' }).notNull().default(sql`0`),
    status: enhanceJobStatusEnum('status').notNull().default('running'),
    /** '최대확률 도달' 알림 1회 보장 게이트(2026-05-26). complete_at 도달 시 cron이 발송 후 true 마크. */
    pushSent: boolean('push_sent').notNull().default(false),
    /** 취소 시각(0102) — 슬롯 전멸 사건 추적용 감사 필드. null=미취소. */
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    /** 취소 피해 보상 우편 발송 시각(0106) — 어드민 보상 도구의 멱등 마커. null=미보상. */
    cancelCompensatedAt: timestamp('cancel_compensated_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // lane 점유 (SLOT_BUSY) — 슬롯·lane에 running 1건.
    uniqueIndex('ej_user_slot_lane_running_uq')
      .on(t.userId, t.serverId, t.slot, t.slotLane)
      .where(sql`${t.status} = 'running'`),
    // 같은 장비(카탈로그) 중복 큐 차단.
    uniqueIndex('ej_equipment_running_uq')
      .on(t.userEquipmentId)
      .where(sql`${t.status} = 'running'`),
    // 완료 도달(push-enhance-ready) 스캔 — running 중 complete_at 지난 잡.
    index('ej_status_complete_idx').on(t.status, t.completeAt),
    index('ej_user_status_idx').on(t.userId, t.status),
  ],
);

/** §3.2 enhancement_logs — append-only 감사(5년). UPDATE/DELETE 금지. */
export const enhancementLogs = pgTable('enhancement_logs', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  /** 소속 서버(SERVER.md P3b). */
  serverId: smallint('server_id').notNull().default(1),
  userId: uuid('user_id').notNull(),
  userEquipmentId: bigint('user_equipment_id', { mode: 'bigint' }).notNull(),
  catalogItemId: integer('catalog_item_id').notNull(),
  fromLevel: integer('from_level').notNull(),
  toLevel: integer('to_level').notNull(),
  result: enhanceResultEnum('result').notNull(),
  baseRateBp: integer('base_rate_bp').notNull(),
  effectiveRateBp: integer('effective_rate_bp').notNull(),
  elapsedMs: bigint('elapsed_ms', { mode: 'bigint' }).notNull(),
  durationMs: bigint('duration_ms', { mode: 'bigint' }).notNull(),
  reducedMs: bigint('reduced_ms', { mode: 'bigint' }).notNull().default(sql`0`),
  /** 사후 검증용(클라 변조 불가). */
  rngSeed: text('rng_seed'),
  rolled: integer('rolled'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** §3.3 gem_time_reductions — 보석 단축 이력(인플레이션·어뷰징 추적, GDD §8). */
export const gemTimeReductions = pgTable('gem_time_reductions', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  /** 소속 서버(SERVER.md P3b). */
  serverId: smallint('server_id').notNull().default(1),
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
