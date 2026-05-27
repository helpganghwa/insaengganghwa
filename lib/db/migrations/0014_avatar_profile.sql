-- 0014_avatar_profile.sql — PROFILE §3 캐릭터 프로필 시스템.
--
-- 추가:
--   1. enum: profile_job_status, profile_direction, profile_report_reason
--   2. enum 값 추가: mailbox_type (profile_accepted / profile_rejected_ai / profile_failed)
--   3. profiles.active_profile_id 컬럼 (FK ON DELETE SET NULL — 순환 회피로 별도 ALTER)
--   4. user_profiles 테이블 (rotations jsonb, active_direction enum, 8방향 시트 보관)
--   5. profile_generation_jobs 테이블 (escrow·status·ai_verdict)
--   6. profile_reports 테이블 (UNIQUE per reporter, 자동 차단 X)
--
-- 멱등 안전: 모두 CREATE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS 사용.

-- ─── 1. enum 신규 ───
DO $$ BEGIN
  CREATE TYPE "profile_job_status" AS ENUM (
    'queued', 'downloading', 'ai_reviewing', 'accepted', 'rejected_ai', 'failed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "profile_direction" AS ENUM (
    'south', 'east', 'north', 'west',
    'south_east', 'north_east', 'north_west', 'south_west'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "profile_report_reason" AS ENUM (
    'nsfw', 'violence', 'hate', 'quality', 'impersonation', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 2. mailbox_type 값 추가(IF NOT EXISTS 8.7+) ───
ALTER TYPE "mailbox_type" ADD VALUE IF NOT EXISTS 'profile_accepted';
ALTER TYPE "mailbox_type" ADD VALUE IF NOT EXISTS 'profile_rejected_ai';
ALTER TYPE "mailbox_type" ADD VALUE IF NOT EXISTS 'profile_failed';

-- ─── 3. profiles.active_profile_id ───
ALTER TABLE "profiles"
  ADD COLUMN IF NOT EXISTS "active_profile_id" uuid;

-- ─── 4. user_profiles ───
CREATE TABLE IF NOT EXISTS "user_profiles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "profiles"("id") ON DELETE CASCADE,
  "rotations" jsonb NOT NULL,
  "active_direction" "profile_direction" NOT NULL DEFAULT 'south',
  "pixellab_character_id" text NOT NULL,
  "options" jsonb NOT NULL,
  "equipment_snapshot" jsonb NOT NULL,
  "description_prompt" text NOT NULL,
  "report_count" integer NOT NULL DEFAULT 0,
  "hidden_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "user_profiles_user_id_created_at_idx"
  ON "user_profiles" ("user_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "user_profiles_report_count_idx"
  ON "user_profiles" ("report_count" DESC)
  WHERE "hidden_at" IS NULL;

-- 순환 회피 ALTER (profiles → user_profiles, ON DELETE SET NULL):
DO $$ BEGIN
  ALTER TABLE "profiles"
    ADD CONSTRAINT "profiles_active_profile_id_fk"
    FOREIGN KEY ("active_profile_id") REFERENCES "user_profiles"("id")
    ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 5. profile_generation_jobs ───
CREATE TABLE IF NOT EXISTS "profile_generation_jobs" (
  "id" bigserial PRIMARY KEY,
  "user_id" uuid NOT NULL REFERENCES "profiles"("id") ON DELETE CASCADE,
  "pixellab_character_id" text,
  "description_prompt" text NOT NULL,
  "options" jsonb NOT NULL,
  "equipment_snapshot" jsonb NOT NULL,
  "diamond_escrow" bigint NOT NULL,
  "status" "profile_job_status" NOT NULL DEFAULT 'queued',
  "ai_verdict" jsonb,
  "reject_reason" text,
  "user_profile_id" uuid REFERENCES "user_profiles"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "resolved_at" timestamptz
);

CREATE INDEX IF NOT EXISTS "profile_gen_status_created_idx"
  ON "profile_generation_jobs" ("status", "created_at");

CREATE INDEX IF NOT EXISTS "profile_gen_user_created_idx"
  ON "profile_generation_jobs" ("user_id", "created_at" DESC);

-- 유저당 활성 큐 1건 — DB 레벨 보장(PROFILE §3.2).
CREATE UNIQUE INDEX IF NOT EXISTS "profile_gen_one_active_per_user"
  ON "profile_generation_jobs" ("user_id")
  WHERE "status" IN ('queued', 'downloading', 'ai_reviewing');

-- ─── 6. profile_reports ───
CREATE TABLE IF NOT EXISTS "profile_reports" (
  "id" bigserial PRIMARY KEY,
  "profile_id" uuid NOT NULL REFERENCES "user_profiles"("id") ON DELETE CASCADE,
  "reporter_user_id" uuid NOT NULL REFERENCES "profiles"("id") ON DELETE CASCADE,
  "reason" "profile_report_reason" NOT NULL,
  "note" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "profile_reports_profile_reporter_uq"
  ON "profile_reports" ("profile_id", "reporter_user_id");

CREATE INDEX IF NOT EXISTS "profile_reports_profile_created_idx"
  ON "profile_reports" ("profile_id", "created_at" DESC);
