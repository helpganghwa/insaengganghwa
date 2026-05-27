/**
 * PROFILE §3. 캐릭터 프로필(아바타) 시스템.
 *
 * - `user_profiles`: 검토 통과한 활성 프로필. 유저당 N장.
 * - `profile_generation_jobs`: 생성 작업 추적(escrow·AI verdict·환불 사유).
 * - `profile_reports`: 사후 신고(자동 차단 X, count 누적만 — PROFILE §7).
 *
 * `profiles.active_profile_id`는 profiles.ts에서 추가(순환 import 회피, FK는
 * 마이그레이션에서 ALTER로 처리).
 */
import {
  pgTable,
  pgEnum,
  uuid,
  bigserial,
  bigint,
  text,
  integer,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { profiles } from './profiles';

/** PROFILE §3.2 status — 생성 작업 라이프사이클. */
export const profileJobStatusEnum = pgEnum('profile_job_status', [
  'queued',
  'downloading',
  'ai_reviewing',
  'accepted',
  'rejected_ai',
  'failed',
]);

/** Pixellab v2 8방향(south/north/east/west + 4 diagonal). 유저는 상세에서 회전·active 선택. */
export const profileDirectionEnum = pgEnum('profile_direction', [
  'south',
  'east',
  'north',
  'west',
  'south_east',
  'north_east',
  'north_west',
  'south_west',
]);

/** PROFILE §3.4 신고 reason — AI 검토(§5.2)와 정렬 + 신고 전용 2종. */
export const profileReportReasonEnum = pgEnum('profile_report_reason', [
  'nsfw',
  'violence',
  'hate',
  'quality',
  'impersonation',
  'other',
]);

/**
 * 검토 통과한 active 프로필. 자랑카드(§3.7)·hub·랭킹에 표시.
 * `hidden_at`은 운영자가 신고 누적 후 수동 비공개 처리(자동 차단 X, PROFILE §7).
 */
export const userProfiles = pgTable(
  'user_profiles',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    /**
     * 8방향 PNG URL — `{ south, east, north, west, south_east, north_east, north_west, south_west }`.
     * Pixellab v2 8방향 시트를 Supabase Storage에 미러링한 결과. 자랑카드·hub·랭킹은
     * `rotations[active_direction]` 단일 이미지 사용. 상세 화면에서 8방향 회전 가능.
     */
    rotations: jsonb('rotations').notNull(),
    /** 현재 active 방향 — 유저가 상세에서 선택. default 'south'(정면). */
    activeDirection: profileDirectionEnum('active_direction').notNull().default('south'),
    /** Pixellab character_id — 재다운로드/추적용. */
    pixellabCharacterId: text('pixellab_character_id').notNull(),
    /** 유저가 고른 옵션(gender·hair·expression·pose 등, PROFILE §5 [TBD] 확정 후 enum 검증). */
    options: jsonb('options').notNull(),
    /** 생성 시점 장비 3종 스냅샷 `{ weapon, armor, accessory }`(카탈로그 키). 디버그·재현용. */
    equipmentSnapshot: jsonb('equipment_snapshot').notNull(),
    /** 서버 합성한 최종 description(재현·신고 처리용). */
    descriptionPrompt: text('description_prompt').notNull(),
    /** 누적 신고 수(표시·정렬용, 자동 차단 X). */
    reportCount: integer('report_count').notNull().default(0),
    /** 운영자 수동 비공개 시점(null=공개). */
    hiddenAt: timestamp('hidden_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('user_profiles_user_id_created_at_idx').on(t.userId, t.createdAt.desc()),
    // 운영자 신고 대시보드 — 공개 + 신고 많은 순.
    index('user_profiles_report_count_idx')
      .on(t.reportCount.desc())
      .where(sql`${t.hiddenAt} IS NULL`),
  ],
);
export type UserProfile = typeof userProfiles.$inferSelect;
export type NewUserProfile = typeof userProfiles.$inferInsert;

/**
 * 생성 작업 추적 — 검토 큐 아님(AI 자동 검토, §5). escrow·verdict·환불 사유까지 한 행.
 * 유저당 활성 큐(queued/downloading/ai_reviewing) 1건 제약 → UNIQUE 부분 인덱스(아래).
 */
export const profileGenerationJobs = pgTable(
  'profile_generation_jobs',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    /** Pixellab 큐 등록 후 채워짐 (character 다운로드용). */
    pixellabCharacterId: text('pixellab_character_id'),
    /** Pixellab background job ID — status polling 키(/v2/background-jobs/{id}). */
    pixellabBackgroundJobId: text('pixellab_background_job_id'),
    descriptionPrompt: text('description_prompt').notNull(),
    options: jsonb('options').notNull(),
    equipmentSnapshot: jsonb('equipment_snapshot').notNull(),
    /** 차감된 다이아 — 거절 시 환불 금액. */
    diamondEscrow: bigint('diamond_escrow', { mode: 'bigint' }).notNull(),
    status: profileJobStatusEnum('status').notNull().default('queued'),
    /** Claude vision 응답 `{pass, reasons[], notes}` — ai-review.ts ReviewVerdict와 일치. */
    aiVerdict: jsonb('ai_verdict'),
    /** 환불 통지 우편함 본문에 들어갈 사유(한국어). */
    rejectReason: text('reject_reason'),
    /** 통과 시 user_profiles.id. */
    userProfileId: uuid('user_profile_id').references(() => userProfiles.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (t) => [
    // cron 폴링용 — 처리 중인 작업 status 순회.
    index('profile_gen_status_created_idx').on(t.status, t.createdAt),
    // 유저 대기 표시용 — 본인 최근 작업 N건.
    index('profile_gen_user_created_idx').on(t.userId, t.createdAt.desc()),
    // 유저당 활성 큐 1건 — DB 레벨 보장(PROFILE §3.2).
    uniqueIndex('profile_gen_one_active_per_user')
      .on(t.userId)
      .where(sql`${t.status} IN ('queued', 'downloading', 'ai_reviewing')`),
  ],
);
export type ProfileGenerationJob = typeof profileGenerationJobs.$inferSelect;
export type NewProfileGenerationJob = typeof profileGenerationJobs.$inferInsert;

/**
 * 신고 1건 = 1행. 같은 유저가 같은 프로필 중복 신고 못 함(UNIQUE).
 * 자동 비공개 X — count만 누적, 운영자 직접 조치(PROFILE §7).
 */
export const profileReports = pgTable(
  'profile_reports',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => userProfiles.id, { onDelete: 'cascade' }),
    reporterUserId: uuid('reporter_user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    reason: profileReportReasonEnum('reason').notNull(),
    /** reason='other'용 보조 설명(200자 권고). */
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('profile_reports_profile_reporter_uq').on(t.profileId, t.reporterUserId),
    index('profile_reports_profile_created_idx').on(t.profileId, t.createdAt.desc()),
  ],
);
export type ProfileReport = typeof profileReports.$inferSelect;
export type NewProfileReport = typeof profileReports.$inferInsert;
