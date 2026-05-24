-- §11 PWA Web Push v1 (GDD §3.10 — 강화/레이드/보급 3종 한정)
-- 적용처: 공유 Supabase. db-provisioning-state 메모리 갱신 필수.

-- 1) profiles 카테고리 토글 컬럼 (기본 ON — 첫 권한 동의 후 즉시 받음)
ALTER TABLE "profiles"
  ADD COLUMN IF NOT EXISTS "push_enhance" boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "push_raid"    boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "push_supply"  boolean NOT NULL DEFAULT true;

-- 2) push_category enum
DO $$ BEGIN
  CREATE TYPE "push_category" AS ENUM ('enhance', 'raid', 'supply');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3) push_subscriptions — 디바이스별 구독. endpoint UNIQUE = 재구독 멱등.
CREATE TABLE IF NOT EXISTS "push_subscriptions" (
  "id"          bigserial PRIMARY KEY,
  "user_id"     uuid NOT NULL REFERENCES "profiles"("id") ON DELETE CASCADE,
  "endpoint"    text NOT NULL UNIQUE,
  "p256dh"      text NOT NULL,
  "auth"        text NOT NULL,
  "user_agent"  text,
  "created_at"  timestamptz NOT NULL DEFAULT now(),
  "updated_at"  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "push_sub_user_idx" ON "push_subscriptions" ("user_id");

-- 4) push_pending — 카테고리별 누적 큐. (user_id, category) PK = 사용자당 1행.
--    강화 그룹화: 30분 first_at 윈도 후 cron이 flush.
CREATE TABLE IF NOT EXISTS "push_pending" (
  "user_id"    uuid NOT NULL REFERENCES "profiles"("id") ON DELETE CASCADE,
  "category"   "push_category" NOT NULL,
  "items"      jsonb NOT NULL DEFAULT '[]'::jsonb,
  "first_at"   timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("user_id", "category")
);
CREATE INDEX IF NOT EXISTS "push_pending_flush_idx" ON "push_pending" ("first_at");
