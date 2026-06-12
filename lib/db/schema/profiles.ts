/**
 * SCHEMA §1. profiles (계정/유저)
 *
 * Supabase `auth.users`(Kakao OAuth)와 1:1. `auth` 스키마는 Supabase 관리 —
 * Drizzle은 `public`만 다룬다(`id`는 auth.users.id 값을 그대로 PK로 사용).
 * 등급/시즌/천장/자가통계 컬럼 없음. `diamond` 변동은 항상 트랜잭션+감사(직접 UPDATE 금지).
 */
import {
  pgTable,
  pgEnum,
  uuid,
  text,  boolean,
  timestamp,
  smallint,
} from 'drizzle-orm/pg-core';

/** 강화 푸시 모드 — instant(슬롯별 즉시) | batched(30분 그룹화) | batched_1h(1시간 그룹화). 기본 instant. */
export const pushEnhanceModeEnum = pgEnum('push_enhance_mode', ['instant', 'batched', 'batched_1h']);

export const profiles = pgTable('profiles', {
  /** = auth.users.id (Supabase). FK는 DB 레벨에서 auth.users 참조(마이그레이션에서 설정). */
  id: uuid('id').primaryKey(),
  /**
   * 불변 공개 식별자(base62 8자) — /u·/og·/s·추천 링크의 안정 URL 키.
   * 닉네임은 변경/재사용 가능 → 외부 공유·OG·추천 링크가 깨지므로 코드로 식별.
   * DB에서 가입 시 DEFAULT gen_public_code()로 자동 부여(마이그레이션 0021). 절대 변경 안 함.
   */
  publicCode: text('public_code').notNull().unique(),
  /** 단일 프리미엄 재화(=보석, BALANCE §6.1). int32 회피 위해 bigint. */
  isAdult: boolean('is_adult').notNull().default(false),
  identityVerifiedAt: timestamp('identity_verified_at', { withTimezone: true }),
  /** 해시만 — 원본 미저장 (REGULATORY). */
  birthYearHash: text('birth_year_hash'),
  /** 닉네임 변경 횟수. 첫 변경 무료, 이후 1000 다이아 차감(NICKNAME_CHANGE_COST_DIAMOND). */
  /** Day1 온보딩 진행 (GDD §4). */
  /** 어드민 권한(우편함 발송 등). 1인 운영 — 본인 계정만 직접 SQL로 true 설정. */
  isAdmin: boolean('is_admin').notNull().default(false),
  /** PWA Push 카테고리 토글(GDD §3.10 v1) — 기본 ON. 토글 OFF 시 해당 카테고리 발송 skip. */
  pushEnhance: boolean('push_enhance').notNull().default(true),
  pushRaid: boolean('push_raid').notNull().default(true),
  pushSupply: boolean('push_supply').notNull().default(true),
  /** 프로필 생성 검토 완료(완료/반려/실패) 알림 토글 (PROFILE §5.4). 기본 ON. */
  pushProfile: boolean('push_profile').notNull().default(true),
  /** 친구 초대(카카오 공유 가입 귀속) 알림 토글 — 기본 ON(2026-05-31). */
  pushReferral: boolean('push_referral').notNull().default(true),
  /** 대난투 결과 발표 알림 토글 — 기본 ON(MELEE §7). 일일 복귀 푸시 겸함. */
  pushMelee: boolean('push_melee').notNull().default(true),
  /** 강화 모드 — instant(즉시) | batched(30분 묶음). 기본 instant. */
  pushEnhanceMode: pushEnhanceModeEnum('push_enhance_mode').notNull().default('instant'),
  /**
   * 현재 active 캐릭터 프로필(`user_profiles.id`). null = 미설정(fallback 아이콘).
   * FK는 마이그레이션에서 `ON DELETE SET NULL`로 ALTER 추가(순환 import 회피).
   * PROFILE §3.3.
   */
  /**
   * 활성 프로필 배경 key(`lib/game/profile/backgrounds.ts`). null = 배경 없음(기본).
   * 전역 1개 — 캐릭터와 무관하게 대표 카드·OG·랭킹에 공통 적용. PROFILE §8.
   */
  activeBackground: text('active_background'),
  /**
   * 거주 구역(GUILD §5.5) — 강화 성공 시 그 구역에 세금 포인트 가산. null=미배정(최초 랜덤 배정).
   * FK(`zones.id`)는 마이그레이션에서 ALTER 추가(순환 import 회피, activeProfileId와 동일 패턴).
   */
  /** 마지막 접속 시각 — 쿠키 게이트 하트비트(2분 스로틀)로 갱신. 길드원·친구 목록 접속 상태 표시용. */
  /** 마지막 활성 서버(SERVER.md 경계규칙1) — 푸시는 이 서버의 이벤트만 발송. */
  lastServerId: smallint('last_server_id').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;
