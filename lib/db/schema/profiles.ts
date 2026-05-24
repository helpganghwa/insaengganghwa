/**
 * SCHEMA §1. profiles (계정/유저)
 *
 * Supabase `auth.users`(Kakao OAuth)와 1:1. `auth` 스키마는 Supabase 관리 —
 * Drizzle은 `public`만 다룬다(`id`는 auth.users.id 값을 그대로 PK로 사용).
 * 등급/시즌/천장/자가통계 컬럼 없음. `diamond` 변동은 항상 트랜잭션+감사(직접 UPDATE 금지).
 */
import { pgTable, uuid, text, bigint, boolean, integer, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const profiles = pgTable('profiles', {
  /** = auth.users.id (Supabase). FK는 DB 레벨에서 auth.users 참조(마이그레이션에서 설정). */
  id: uuid('id').primaryKey(),
  nickname: text('nickname').notNull().unique(),
  /** 단일 프리미엄 재화(=보석, BALANCE §6.1). int32 회피 위해 bigint. */
  diamond: bigint('diamond', { mode: 'bigint' }).notNull().default(sql`0`),
  isAdult: boolean('is_adult').notNull().default(false),
  identityVerifiedAt: timestamp('identity_verified_at', { withTimezone: true }),
  /** 해시만 — 원본 미저장 (REGULATORY). */
  birthYearHash: text('birth_year_hash'),
  representativeTitleCode: text('representative_title_code'),
  /** 닉네임 변경 횟수. 첫 변경 무료, 이후 1000 다이아 차감(NICKNAME_CHANGE_COST_DIAMOND). */
  nicknameChangedCount: integer('nickname_changed_count').notNull().default(0),
  /** Day1 온보딩 진행 (GDD §4). */
  tutorialStep: integer('tutorial_step').notNull().default(0),
  /** 어드민 권한(우편함 발송 등). 1인 운영 — 본인 계정만 직접 SQL로 true 설정. */
  isAdmin: boolean('is_admin').notNull().default(false),
  /** PWA Push 카테고리 토글(GDD §3.10 v1) — 기본 ON. 토글 OFF 시 해당 카테고리 발송 skip. */
  pushEnhance: boolean('push_enhance').notNull().default(true),
  pushRaid: boolean('push_raid').notNull().default(true),
  pushSupply: boolean('push_supply').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;
