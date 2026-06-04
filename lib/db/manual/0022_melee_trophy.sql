-- 대난투 우승 트로피 아바타 자동 생성 파이프라인 상태(melee_battles 확장). MELEE §우승컵.
-- 수동 적용: Supabase SQL editor에서 1회 실행. (db-provisioning-state 메모 참조)
ALTER TABLE "melee_battles" ADD COLUMN IF NOT EXISTS "trophy_status" text;
ALTER TABLE "melee_battles" ADD COLUMN IF NOT EXISTS "trophy_char_id" text;
ALTER TABLE "melee_battles" ADD COLUMN IF NOT EXISTS "trophy_pose" text;
ALTER TABLE "melee_battles" ADD COLUMN IF NOT EXISTS "trophy_attempts" integer NOT NULL DEFAULT 0;
ALTER TABLE "melee_battles" ADD COLUMN IF NOT EXISTS "trophy_updated_at" timestamptz;
