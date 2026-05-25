-- 강화 푸시 모드 + 일일 보급 broadcast 멱등 인프라 (2026-05-25)

-- 1) profiles.push_enhance_mode — 'instant' | 'batched' (기본 instant)
DO $$ BEGIN
  CREATE TYPE "push_enhance_mode" AS ENUM ('instant', 'batched');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "profiles"
  ADD COLUMN IF NOT EXISTS "push_enhance_mode" "push_enhance_mode" NOT NULL DEFAULT 'instant';

-- 2) daily_supply_broadcasts — 일일 보급 푸시 발송 멱등 키
--    kst_day PK, sent_at으로 중복 발송 방지(매 30분 fallback cron이 안전하게 재시도 가능).
CREATE TABLE IF NOT EXISTS "daily_supply_broadcasts" (
  "kst_day"    date PRIMARY KEY,
  "sent_at"    timestamptz NOT NULL DEFAULT now(),
  "recipients" integer NOT NULL DEFAULT 0
);
