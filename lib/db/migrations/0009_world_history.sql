-- §12 세계역사 (SCREEN-ANALYSIS §4, 2026-05-25)
-- 적용처: 공유 Supabase. db-provisioning-state 메모리 갱신 필수.

-- 1) world_event_type enum
DO $$ BEGIN
  CREATE TYPE "world_event_type" AS ENUM (
    'enhance_99', 'transcend_max', 'codex_complete',
    'champion_new', 'operator_notice', 'genesis'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) world_history — 자동 적재 + 운영 공지 + 창세 시드 통합.
--    user_id NULL = 시스템 이벤트(operator_notice/genesis).
CREATE TABLE IF NOT EXISTS "world_history" (
  "id"          bigserial PRIMARY KEY,
  "user_id"     uuid REFERENCES "profiles"("id") ON DELETE SET NULL,
  "event_type"  "world_event_type" NOT NULL,
  "payload"     jsonb NOT NULL,
  "message"     text NOT NULL,
  "created_at"  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "world_history_created_idx" ON "world_history" ("created_at" DESC);
