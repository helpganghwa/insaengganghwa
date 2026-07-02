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
  smallint,
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
  // 'starting' — drainQueue가 동시성 슬롯을 선점(queued→starting)한 뒤 Pixellab 호출 전까지의 예약
  //  상태. poll(downloading만 조회)은 무시 → characterId 없이도 오작동 없음. 0095에서 enum 끝에 append.
  'starting',
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

/**
 * PROFILE §3.4 신고 reason.
 * 운영 카테고리: nickname / avatar / bug_abuse / other (사용자 선택 4종).
 * 레거시(nsfw/violence/hate/quality/impersonation)는 과거 신고 row 호환 — 읽기 전용.
 */
export const profileReportReasonEnum = pgEnum('profile_report_reason', [
  'nickname',
  'avatar',
  'bug_abuse',
  'nsfw',
  'violence',
  'hate',
  'quality',
  'impersonation',
  'other',
]);

/**
 * 검토 통과한 active 프로필. 자랑카드(§3.7)·hub·랭킹에 표시.
 * 신고 누적 시 운영자는 아바타 초기화(기본 전환)·경고·계정 정지로 조치(PROFILE §7).
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
    /** 소속 서버(SERVER.md P6) — 아바타는 캐릭터 자산. */
    serverId: smallint('server_id').notNull().default(1),
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
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('user_profiles_user_id_created_at_idx').on(t.userId, t.createdAt.desc()),
    // 운영자 신고 대시보드 — 신고 많은 순.
    index('user_profiles_report_count_idx').on(t.reportCount.desc()),
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
  /** escrow 차감 서버(SERVER.md P4) — 환불 정합. */
  serverId: smallint('server_id').notNull().default(1),
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
    /**
     * 운영자 검수(분쟁 처리) 결정 — null=미검수.
     * 'confirm'(AI 결정 인정·무조치) | 'grant'(보상 다이아 지급) | 'reject'(아바타 회수+환불).
     */
    adminDecision: text('admin_decision'),
    /** 운영자 결정 시각(null=미검수). 날짜별 점검 시 미검수/검수완료 구분. */
    adminReviewedAt: timestamp('admin_reviewed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (t) => [
    // cron 폴링용 — 처리 중인 작업 status 순회.
    index('profile_gen_status_created_idx').on(t.status, t.createdAt),
    // 유저 대기 표시용 — 본인 최근 작업 N건.
    index('profile_gen_user_created_idx').on(t.userId, t.createdAt.desc()),
    // 유저당 활성 큐 1건 — DB 레벨 보장(PROFILE §3.2). 종단(accepted/rejected_ai/failed)이 아닌
    // 모든 상태 = 활성(0095). starting 포함.
    uniqueIndex('profile_gen_one_active_per_user')
      .on(t.userId)
      .where(sql`${t.status} NOT IN ('accepted', 'rejected_ai', 'failed')`),
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
    // 같은 신고자라도 사유가 다르면 재신고 허용 — (프로필, 신고자, 사유) 단위 1회.
    uniqueIndex('profile_reports_profile_reporter_reason_uq').on(
      t.profileId,
      t.reporterUserId,
      t.reason,
    ),
    index('profile_reports_profile_created_idx').on(t.profileId, t.createdAt.desc()),
  ],
);
export type ProfileReport = typeof profileReports.$inferSelect;
export type NewProfileReport = typeof profileReports.$inferInsert;
